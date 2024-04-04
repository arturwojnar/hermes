import { expect } from '@jest/globals'
import { isNil, noop, swallow } from './utils'

test(`noop is a function that does nothing`, () => {
  expect(typeof noop).toEqual('function')
  expect(noop()).toBeUndefined()
})

test(`isNil checks whether the value is null or undefined`, () => {
  expect(typeof isNil).toEqual('function')
  expect(isNil(null)).toBeTruthy()
  expect(isNil(undefined)).toBeTruthy()
  expect(isNil(0)).toBeFalsy()
  expect(isNil('')).toBeFalsy()
  expect(isNil(NaN)).toBeFalsy()
  expect(isNil({})).toBeFalsy()
  expect(isNil([])).toBeFalsy()
  expect(isNil('test')).toBeFalsy()
})

test(`swallow cacthes a sync function error and do nothing`, () => {
  swallow(() => {
    throw new Error()
  }) // no error
  swallow(() => 'some value')
})

test(`swallow cacthes an async function error and do nothing`, async () => {
  await swallow(async () => await Promise.reject(new Error())) // no error
  await swallow(async () => await Promise.resolve())
})
