import crypto from 'node:crypto'
import { NonEmptyString } from './NonEmptyString.js'

type Sha256Of<T extends { toString: () => string }, Rest extends { toString: () => string }[] = []> = Rest extends []
  ? [T]
  : Rest extends [infer First extends { toString: () => string }, ...infer Other extends { toString: () => string }[]]
    ? [T, First, ...Other]
    : [T]

type Sha256Hash<Input> = string & {
  __brand: 'SHA256'
  __input: Input
}

type Sha256<T extends { toString: () => string }, Rest extends { toString: () => string }[] = []> = Sha256Hash<
  Rest extends [] ? [T] : [T, ...Rest]
>

type EventId = NonEmptyString<'EventId'>

const createSha256From = <T extends { toString: () => string }, Rest extends { toString: () => string }[] = []>(
  fromValues: Sha256Of<T, Rest>,
) => {
  const hash = crypto.createHash('sha256')

  for (const value of fromValues) {
    hash.update(value.toString())
  }

  return hash.digest('hex') as Sha256<T, Rest>
}

export { createSha256From, type EventId, type Sha256, type Sha256Of }
