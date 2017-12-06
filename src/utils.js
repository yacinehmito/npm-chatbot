// @flow

type IterationCallback<T, E> = (el: T, index: number, array: T[]) => E;

export function noop() {}

export function identity<T>(arg: T): T {
  return arg;
}

export function flatMap<T, E>(array: T[], callback: IterationCallback<T, E[]>): E[] {
  const result: E[] = [];
  for (let i: number = 0; i < array.length; i += 1) {
    result.push(...callback(array[i], i, array));
  }
  return result;
}

export function uniquify<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

export function getUndefinedKeys(object: Object): string[] {
  return Object.keys(object).filter(key => object[key] === undefined);
}

export function makeAsync<I, O>(f: I => O): I => Promise<O> {
  return input => new Promise((resolve) => {
    setImmediate(() => {
      resolve(f(input));
    });
  });
}

