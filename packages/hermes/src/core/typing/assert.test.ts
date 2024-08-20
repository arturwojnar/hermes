import { expect } from '@jest/globals'
import { AssertionError } from '../errors'
import { assertDate } from './assert'

test(`assertDate throws an AssertionError is the value is not a Date`, () => {
  expect(() => assertDate(1)).toThrowError(AssertionError)
  expect(() => assertDate('1')).toThrowError(AssertionError)
  expect(() => assertDate(new Date('no date'))).toThrowError(AssertionError)
  expect(() => assertDate(true)).toThrowError(AssertionError)
  expect(() => assertDate({})).toThrowError(AssertionError)
  expect(() => assertDate(undefined)).toThrowError(AssertionError)
  expect(() => assertDate(null)).toThrowError(AssertionError)
  expect(() => assertDate(new Date().getTime())).toThrowError(AssertionError)

  try {
    assertDate('test')
  } catch (error) {
    expect(error).toEqual(new AssertionError({ forValue: 'test', forKey: 'date' }, `Value is not a date`))
  }

  assertDate(new Date()) // no exception
})
