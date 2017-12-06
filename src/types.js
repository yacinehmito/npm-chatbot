// @flow

// Not an exact type because they are buggy
export type Package = {
  name: string,
  keywords: string[],
  dependencies: string[],
  numberOfDependents: number
};

export type Registry = Package[];
