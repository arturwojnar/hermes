import { Flavour } from './core/typing/flavour'

export type PositiveInteger<T extends number = number> = `${T}` extends `-${string}` | `${string}.${string}`
  ? never
  : Flavour<T, 'PositiveInteger'>

export type PositiveNumber = Flavour<number, 'PositiveNumber'>
