// @flow
import axios from 'axios';
import type { AxiosPromise } from 'axios';

import type { Package } from './types';

const npmService = axios.create({
  baseURL: 'https://registry.npmjs.org',
});

type SearchParams = {
  text?: string,
  size?: number,
  from?: number,
  quality?: number,
  popularity?: number,
  maintenance?: number,
};

type Score = {
  final: number,
  detail: {
    quality: number,
    popularity: number,
    maintenance: number,
  },
};

type SearchResult = {
  objects: {
    package: Package,
    score: Score,
    searchScore: number,
  }[],
  total: number,
  time: string,
};

export function search(params: SearchParams): Promise<SearchResult> {
  // flow-typed axios module doesn't export the type for the response
  const promise: AxiosPromise<SearchResult> = npmService.get('/-/v1/search', { params });
  return promise.then(response => response.data);
}

export default npmService;
