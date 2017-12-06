// @flow
// @flow-runtime ignore
import { Transform, Readable, Writable } from 'stream';
import { identity } from './utils';

type Mapping<I, O> = (input: I) => O;
type PromiseMapping<I, O> = (input: I) => Promise<O>
type CPSMapping<I, O> = (input: I, write: O => void, done: () => void) => void

// Disabling no-unused-vars for phantom types
export type ReadableStream<I> = Readable // eslint-disable-line no-unused-vars
export type WritableStream<O> = Writable // eslint-disable-line no-unused-vars
export type TransformStream<I, O> = Transform & ReadableStream<I> & WritableStream<O>

export function makeTransformStream<I, O>(
  callback: CPSMapping<I, O>,
  objectMode: boolean = true,
): TransformStream<I, O> {
  return new Transform({
    objectMode,
    transform(chunk: any, encoding: string, done: () => void) {
      callback(
        (chunk: I),
        (output) => {
          this.push((output: any));
        },
        done,
      );
    },
  });
}

export function transform<I, O>(callback: PromiseMapping<I, O>): TransformStream<I, O> {
  return makeTransformStream((input, write, done) => {
    callback(input).then(write).then(done);
  });
}

export function aggregateStreamAndMap<I, O>(
  stream: ReadableStream<I>,
  mapping: Mapping<I, O>,
  size: ?number,
): Promise<O[]> {
  let array: Array<O>;
  if (size == null) {
    array = [];
    stream.on('data', (data: I) => array.push(mapping(data)));
  } else {
    let index = 0;
    array = new Array(size);
    stream.on('data', (data: I) => {
      array[index] = mapping(data);
      index += 1;
    });
  }
  return new Promise((resolve) => {
    stream.on('end', () => {
      setImmediate(() => {
        resolve(array);
      });
    });
  });
}

export function aggregateStream<T>(
  stream: ReadableStream<T>,
  size: ?number,
): Promise<T[]> {
  return aggregateStreamAndMap(stream, identity, size);
}
