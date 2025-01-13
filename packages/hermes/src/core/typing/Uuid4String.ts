import crypto from 'node:crypto'
import { validate as validateUuid } from 'uuid'
import { AssertionError } from '../errors.js'
import { NonEmptyString, parseNonEmptyString } from './NonEmptyString.js'

type Uuid4String<T extends string = string> = NonEmptyString<T, crypto.UUID> & {
  readonly __isUUID4?: true
}

const parseUuid4 = <T extends string = string>(value: string) => {
  if (!validateUuid(value) || !parseNonEmptyString(value)) {
    throw new AssertionError({ forValue: 'Uuid4String' })
  }

  return value as Uuid4String<T>
}

export { parseUuid4, type Uuid4String }
