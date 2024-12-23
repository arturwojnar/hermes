import { AssertionError } from '../errors.js'

export function assertDate(value: unknown): asserts value is Date {
  if (!(value instanceof Date) || isNaN(new Date(value).getTime())) {
    throw new AssertionError({ forValue: value, forKey: 'date' }, `Value is not a date`)
  }
}
