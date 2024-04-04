import { expect } from '@jest/globals'
import { AssertionError, HermesError, HermesErrorCode } from './errors'

test(`HermesError is instance of Error`, () => {
  expect(HermesError.prototype.name).toEqual('Error')
})

test(`AssertionError works`, () => {
  const error = new AssertionError({ forValue: 'test', forKey: 'date' }, `Value is not a date`)
  expect(error).toBeInstanceOf(Error)
  expect(error).toBeInstanceOf(HermesError)
  expect(error.code).toEqual(HermesErrorCode.Assertion)
  expect(error.details?.forKey).toEqual('date')
  expect(error.details?.forValue).toEqual('test')
  expect(error.message).toEqual('Value is not a date')
})
