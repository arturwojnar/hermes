import { AssertionError } from '../errors.js'
import { Flavour } from './flavour.js'

export type NonEmptyString<T extends string = string> = Flavour<string, 'NonEmptyString'> & {
  readonly __nonEmptyStringType?: T
}

export const parseNonEmptyString = <T extends string = string>(
  arg: string | undefined,
  error?: string,
): NonEmptyString<T> => {
  if (!arg) {
    throw new AssertionError({}, error || `The value is an empty string`)
  }

  return arg
}
