// @flow
// @flow-runtime ignore
import path from 'path';
import { createReadStream, writeFile as writeFileCallback } from 'fs';
import axios from 'axios';
import JSONStream from 'JSONStream';
import { promisify } from 'util';
import generateUuidV4 from 'uuid/v4';

import type { ReadableStream, TransformStream } from './streams';
import type { Package, Registry } from './types';
import {
  uniquify,
  flatMap,
  identity,
  noop,
  makeAsync,
} from './utils';
import { makeTransformStream, aggregateStreamAndMap } from './streams';

const writeFile = promisify(writeFileCallback);

type RawPackage = {
  name: string,
  keywords: ?(string | string[]),
  dependencies: ?Object,
  devDependencies: ?Object,
  peerDependencies: ?Object,
  optionalDependencies: ?Object,
};

type Entity = {
 value: string,
 synonyms: string[],
}

type EntityType = {
  id: string,
  name: string,
  isOverridable: boolean,
  isEnum: boolean,
  automatedExpansion: boolean,
  entries: Entity[],
};

function gatherDependencies(pkg: RawPackage): string[] {
  const depsProps = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  const allDependencies = depsProps.reduce(
    (deps, prop) => deps.concat(Object.keys(pkg[prop] || {})),
    [],
  );
  return uniquify(allDependencies);
}

function normalizeKeywords(input: $PropertyType<RawPackage, 'keywords'>): string[] {
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) return input;
  return [];
}

function splitKeyword(keyword: string): string[] {
  const lcKeyword = keyword.toLowerCase();
  const splitRegex = /[-_ ]/;
  const keywords = lcKeyword.split(splitRegex).filter(identity);
  keywords.push(lcKeyword);
  return keywords;
}

function rawPkgToPkg(pkg: RawPackage): Package {
  const keywords = normalizeKeywords(pkg.keywords);
  keywords.push(pkg.name);
  return {
    name: pkg.name,
    dependencies: gatherDependencies(pkg),
    keywords: uniquify(flatMap(keywords, splitKeyword)),
    numberOfDependents: 0, // will be computed later
  };
}

function downloadRawRegistry(url: string): ReadableStream<Buffer> {
  const stream = makeTransformStream((input, write, done) => {
    write(input);
    setImmediate(done);
  });
  axios({
    method: 'get',
    url,
    responseType: 'stream',
  }).then((response) => {
    response.data.pipe(stream);
  });
  return stream;
}

function loadRawRegistry(filepath: string): ReadableStream<Buffer> {
  return createReadStream(filepath);
}

type OnStart = (numberOfPackages: number) => void

export function parseRawPkgsStream(onStart: OnStart = noop): TransformStream<Buffer, RawPackage> {
  let numberOfPackages;

  function toString() {
    return this.name;
  }

  const jsonStream =
    JSONStream.parse('rows.*', chunk => Object.assign({ toString }, chunk.value, { name: chunk.key }));

  jsonStream.on('header', (header) => {
    numberOfPackages = header.rows;
    onStart(numberOfPackages);
  });

  return jsonStream;
}

export function buildRegistry(
  stream: ReadableStream<RawPackage>,
  numberOfPackages: ?number,
): Promise<Registry> {
  return aggregateStreamAndMap(stream, rawPkgToPkg, numberOfPackages);
}

export function computeNumberOfDependents(registry: Registry): Registry {
  const registryIndexedByName = new Map(registry.map(pkg => [pkg.name, Object.assign({}, pkg)]));
  registry.forEach((pkg) => {
    pkg.dependencies.forEach((depName) => {
      const dep = registryIndexedByName.get(depName);
      if (dep) dep.numberOfDependents += 1;
    });
  });
  return Array.from(registryIndexedByName.values());
}

export function filterAndSortByNumberOfDependents(
  registry: Registry,
  minNumberOfDependents: number,
): Registry {
  return registry
    .filter(pkg => pkg.numberOfDependents > minNumberOfDependents)
    .sort((pkg1, pkg2) => pkg2.numberOfDependents - pkg1.numberOfDependents);
}

export function getKeywordsSortedByFrequency(
  registry: Registry,
  maxNumberOfKeywords: number,
): string[] {
  const distribution: Map<string, number> = new Map();
  registry.forEach((pkg) => {
    pkg.keywords.forEach((keyword) => {
      if (!/(^[^a-zA-Z0-9]|[^a-zA-Z0-9-.])/.test(keyword)) {
        distribution.set(keyword, (distribution.get(keyword) || 0) + 1);
      }
    });
  });
  return Array.from(distribution.entries())
    .sort(([, freq1], [, freq2]) => freq2 - freq1)
    .map(([keyword]) => keyword)
    .filter((keyword, i) => i < maxNumberOfKeywords);
}

export function fromKeywordsToEntities(keywords: string[]): Entity[] {
  return keywords.map(keyword => ({
    value: keyword,
    synonyms: [keyword],
  }));
}

export function saveEntitiesToFile(
  filename: string,
  entityTypeName: string,
  entities: Entity[],
): Promise<void> {
  const entityType: EntityType = {
    id: generateUuidV4(),
    name: entityTypeName,
    isOverridable: true,
    isEnum: false,
    automatedExpansion: true,
    entries: entities,
  };
  return writeFile(filename, JSON.stringify(entityType, null, 2));
}

type BuildOptions = {
  rawRegistryLocation: string,
  minNumberOfDependents: number,
  maxNumberOfKeywords: number,
  onGettingSizeOfRegistry: (numberOfPackages: number) => void,
  entityTypeFilename?: string,
  entityTypeName?: string,
  fetchRegistryFromDisk?: boolean,
};

type BuildResult = {
  config: BuildOptions,
  fetchData: ReadableStream<Buffer>,
  parsePackages: TransformStream<Buffer, RawPackage>,
  aggregatePackages: Promise<Registry>,
  computeStats: Promise<Registry>,
  filterPackages: Promise<Registry>,
  getKeywords: Promise<string[]>,
  getEntities: Promise<Entity[]>,
  saveData: Promise<void>
};

const buildDefaultOptions: BuildOptions = {
  rawRegistryLocation: 'https://skimdb.npmjs.com/registry/_design/scratch/_view/byField',
  minNumberOfDependents: 10,
  maxNumberOfKeywords: 10000,
  onGettingSizeOfRegistry: noop,
  entityTypeFilename: path.join(__dirname, '../data/npmKeywordData.json'),
  entityTypeName: 'npmKeyword',
};

export default function buildKeywordsEntities(options: ?BuildOptions): BuildResult {
  const config = Object.assign({}, buildDefaultOptions, options);
  if (!('fetchRegistryFromDisk' in config)) {
    config.fetchRegistryFromDisk = !(/^http[s]?:\/\//.test(config.rawRegistryLocation));
  }
  Object.freeze(config);

  let numberOfPackages: number;
  function onGettingSizeOfRegistry(size) {
    numberOfPackages = size;
    config.onGettingSizeOfRegistry(size);
  }

  const fetchData = config.fetchRegistryFromDisk
    ? loadRawRegistry(config.rawRegistryLocation)
    : downloadRawRegistry(config.rawRegistryLocation);
  const parsePackages = parseRawPkgsStream(onGettingSizeOfRegistry);
  const aggregatePackages = buildRegistry(
    fetchData.pipe(parsePackages),
    numberOfPackages,
  );
  const computeStats = aggregatePackages.then(makeAsync(computeNumberOfDependents));
  const filterPackages = computeStats.then(makeAsync(registry =>
    filterAndSortByNumberOfDependents(registry, config.minNumberOfDependents)));
  const getKeywords = filterPackages.then(makeAsync(registry =>
    getKeywordsSortedByFrequency(registry, config.maxNumberOfKeywords)));
  const getEntities = getKeywords.then(makeAsync(fromKeywordsToEntities));
  const saveData = getEntities.then(entities =>
    saveEntitiesToFile(config.entityTypeFilename, config.entityTypeName, entities));

  return {
    config,
    fetchData,
    parsePackages,
    aggregatePackages,
    computeStats,
    filterPackages,
    getKeywords,
    getEntities,
    saveData,
  };
}
