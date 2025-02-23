import { describe, expect, jest, test } from '@jest/globals'
import { setTimeout } from 'node:timers/promises'
import { createAsyncOpsQueue } from './createAsyncOpsQueue.js'

describe(`createAsyncOpsQueue`, () => {
  test(`it works when called one by one`, async () => {
    const opsNumber = 10
    const executionTimestamps: number[] = []
    const executionIndexes: number[] = []
    const opMocks = Array(opsNumber)
      .fill(0)
      .map((_, index) =>
        jest.fn<() => Promise<any>>().mockImplementation(async () => {
          executionIndexes.push(index)
          await setTimeout(opsNumber)
          executionTimestamps.push(Date.now())
        }),
      )

    const queue = createAsyncOpsQueue()

    for (let i = 0; i < opsNumber; i++) {
      const op = opMocks[i]
      queue.queue(op)
      await queue.waitFor(op)
    }

    expect(executionIndexes).toEqual(
      Array(opsNumber)
        .fill(0)
        .map((_, i) => i),
    )
    executionTimestamps.reduce((t1, t2) => {
      expect(t1).toBeLessThan(t2)
      return t2
    })
    expect(opMocks.map((op) => op.mock.invocationCallOrder[0])).toEqual(
      Array(opsNumber)
        .fill(0)
        .map((_, i) => i + 1),
    )
  })

  test(`it works`, async () => {
    const opsNumber = 10
    const executionTimestamps: number[] = []
    const executionIndexes: number[] = []
    const array = Array(opsNumber)
      .fill(0)
      .map((_, i) => i)
    const opMocks = array.map((index) =>
      jest.fn<() => Promise<any>>().mockImplementation(async () => {
        executionIndexes.push(index)
        await setTimeout(10 * index)
        executionTimestamps.push(Date.now())
      }),
    )

    const queue = createAsyncOpsQueue()

    await Promise.all(
      array.map((index) => {
        const op = opMocks[index]
        queue.queue(op)
        return queue.waitFor(op)
      }),
    )

    expect(executionIndexes).toEqual(array)
    executionTimestamps.reduce((t1, t2) => {
      expect(t1).toBeLessThan(t2)
      return t2
    })
    expect(opMocks.map((op) => op.mock.invocationCallOrder[0])).toEqual(
      Array(opsNumber)
        .fill(0)
        .map((_, i) => 11 + i),
    )
  })
})
