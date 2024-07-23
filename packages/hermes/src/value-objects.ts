import { Flavour } from './flavour'

export type PositiveInteger<T extends number = number> = `${T}` extends `-${string}` | `${string}.${string}`
  ? never
  : Flavour<T, 'PositiveInteger'>

export type PositiveNumber = Flavour<number, 'PositiveNumber'>

export type Duration = Flavour<PositiveNumber, 'Duration'>

export const parseDuration = (value: number) => {
  if (Number.isInteger(value) && value >= 0) {
    return value as Duration
  }

  throw new Error(`NOT_INTEGER`)
}
