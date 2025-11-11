import { expect, test } from '@jest/globals'
import { AssertionError } from '../errors.js'
import { assertDate } from './assert.js'

test(`assertDate throws an AssertionError is the value is not a Date`, () => {
  expect(() => assertDate(1)).toThrow(AssertionError)
  expect(() => assertDate('1')).toThrow(AssertionError)
  expect(() => assertDate(new Date('no date'))).toThrow(AssertionError)
  expect(() => assertDate(true)).toThrow(AssertionError)
  expect(() => assertDate({})).toThrow(AssertionError)
  expect(() => assertDate(undefined)).toThrow(AssertionError)
  expect(() => assertDate(null)).toThrow(AssertionError)
  expect(() => assertDate(new Date().getTime())).toThrow(AssertionError)

  try {
    assertDate('test')
  } catch (error) {
    expect(error).toEqual(new AssertionError({ forValue: 'test', forKey: 'date' }, `Value is not a date`))
  }

  assertDate(new Date()) // no exception
})
