import { expect } from '@jest/globals'
import { AssertionError, HermesError, HermesErrorCode, NotSupportedMongoVersionError } from './errors'

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

test(`NotSupportedMongoVersionError works`, () => {
  const error = new NotSupportedMongoVersionError(
    { supportedVersions: [5, 6, 7, 8], currentVersion: '4.0.1' },
    `Version 4.0.1 is not supported`,
  )
  expect(error).toBeInstanceOf(Error)
  expect(error).toBeInstanceOf(HermesError)
  expect(error.code).toEqual(HermesErrorCode.NotSupportedMongoVersion)
  expect(error.details?.supportedVersions).toEqual([5, 6, 7, 8])
  expect(error.details?.currentVersion).toEqual('4.0.1')
  expect(error.message).toEqual('Version 4.0.1 is not supported')
})
