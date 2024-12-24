import { expect, test } from '@jest/globals'
import { CancellationPromise } from './CancellablePromise.js'

test(`CancellationPromise can be resolved`, async () => {
  const promise = new CancellationPromise()

  expect(promise).toBeInstanceOf(Promise)
  expect(typeof promise.resolve).toEqual('function')

  promise.resolve('test')

  await expect(promise).resolves.toBe('test')
})

test(`CancellationPromise can be rejected`, async () => {
  const promise = new CancellationPromise()

  expect(promise).toBeInstanceOf(Promise)
  expect(typeof promise.reject).toEqual('function')

  promise.reject(new Error('error'))

  await expect(promise).rejects.toEqual(new Error('error'))
})
