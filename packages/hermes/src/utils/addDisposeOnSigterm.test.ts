import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'
import { setTimeout } from 'node:timers/promises'
import { addDisposeOnSigterm } from './addDisposeOnSigterm.js'

describe('addDisposeOnSigterm', () => {
  const _processOn = process.on

  beforeAll(() => {
    process.on = jest.fn<(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) => NodeJS.Process>() as any
  })
  afterAll(() => {
    process.on = _processOn
  })

  test(`it registers a callback for SIGTERM and SIGINT`, async () => {
    const cleanMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)

    addDisposeOnSigterm(cleanMock)

    expect(cleanMock).not.toHaveBeenCalled()

    expect(process.on).toHaveBeenCalledTimes(2)

    expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function))

    const callback1 = jest.mocked(process.on).mock.calls[0][1]

    const callback2 = jest.mocked(process.on).mock.calls[1][1]

    callback1()
    callback2()

    await setTimeout(200)

    expect(cleanMock).toHaveBeenCalledTimes(2)
  })
})
