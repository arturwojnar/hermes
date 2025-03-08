import { Duration } from '@arturwojnar/hermes'
import { describe, expect, jest, test } from '@jest/globals'
import { setTimeout } from 'node:timers/promises'
import { Lsn } from '../../common/lsn.js'
import { InsertResult } from '../../common/types.js'
import { Transaction } from '../../subscribeToReplicationSlot/types.js'
import { type MessageToPublish, createNonBlockingPublishingQueue } from './createNonBlockingPublishingQueue.js'

describe(`createNonBlockingPublishingQueue`, () => {
  const createMockTransaction = (lsn: Lsn): Transaction<InsertResult> => ({
    transactionId: 1,
    lsn,
    timestamp: new Date(),
    results: [],
  })

  const createMockMessage = (lsn: Lsn): MessageToPublish<InsertResult> => ({
    transaction: createMockTransaction(lsn),
    acknowledge: jest.fn<() => Promise<void>>().mockResolvedValue(),
  })

  const createMockPublish = () =>
    jest.fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>().mockImplementation(async () => {})

  test('should queue unique messages', async () => {
    const mockPublish = createMockPublish()
    // 0 means no resending
    const queue = createNonBlockingPublishingQueue(mockPublish, { waitAfterFailedPublish: Duration.ofSeconds(0) })

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/2')

    queue.queue(message1)
    queue.queue(message2)

    expect(queue.size()).toBe(2)
    queue.dispose()
  })

  test('should ignore duplicate messages based on LSN', () => {
    const mockPublish = createMockPublish()
    const queue = createNonBlockingPublishingQueue(mockPublish, { waitAfterFailedPublish: Duration.ofSeconds(0) })

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/1') // Same LSN

    queue.queue(message1)
    queue.queue(message2)

    expect(queue.size()).toBe(1)
    queue.dispose()
  })

  test('should publish messages in FIFO order if proccessing time of each message is the same', async () => {
    const publishedMessages: Lsn[] = []
    const mockPublish = jest
      .fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>()
      .mockImplementation(async (message) => {
        publishedMessages.push(message.transaction.lsn)
      })

    const { queue, size, run, dispose } = createNonBlockingPublishingQueue(mockPublish, {
      waitAfterFailedPublish: Duration.ofSeconds(0),
    })

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/2')
    const message3 = createMockMessage('0/3')
    const message4 = createMockMessage('0/4')

    await Promise.all([run(queue(message1)), run(queue(message2)), run(queue(message3)), run(queue(message4))])

    expect(publishedMessages).toEqual(['0/1', '0/2', '0/3', '0/4'])

    expect(message1.acknowledge).toHaveBeenCalledTimes(1)
    expect(message2.acknowledge).toHaveBeenCalledTimes(1)
    expect(message3.acknowledge).toHaveBeenCalledTimes(1)
    expect(message4.acknowledge).toHaveBeenCalledTimes(1)

    expect(size()).toBe(0)
    dispose()
  })

  test(`must confirm messages in the order despite the fact the first message's processing got delayed.`, async () => {
    const timestamps: { [key: Lsn]: number } = {}
    const createMockMessage = (lsn: Lsn): MessageToPublish<InsertResult> => ({
      transaction: createMockTransaction(lsn),
      acknowledge: jest.fn<() => Promise<void>>().mockImplementation(() => {
        timestamps[lsn] = Date.now()
        return Promise.resolve()
      }),
    })

    const publishedMessages: Lsn[] = []
    const mockPublish = jest
      .fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>()
      .mockImplementationOnce(async (message) => {
        await setTimeout(1000)
        publishedMessages.push(message.transaction.lsn)
      })
      .mockImplementation(async (message) => {
        publishedMessages.push(message.transaction.lsn)
      })

    const { queue, size, run, waitUntilIsEmpty, dispose } = createNonBlockingPublishingQueue(mockPublish, {
      waitAfterFailedPublish: Duration.ofSeconds(0),
    })

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/2')
    const message3 = createMockMessage('0/3')
    const message4 = createMockMessage('0/4')
    const message5 = createMockMessage('0/5')
    const message6 = createMockMessage('0/6')

    await Promise.all([run(queue(message1)), run(queue(message2)), run(queue(message3)), run(queue(message4))])
    await waitUntilIsEmpty()

    queue(message5)
    await run()

    queue(message6)
    await run()

    expect(publishedMessages).toEqual(['0/2', '0/3', '0/4', '0/1', '0/5', '0/6'])
    expect(message1.acknowledge).toHaveBeenCalledTimes(1)
    expect(message2.acknowledge).toHaveBeenCalledTimes(1)
    expect(message3.acknowledge).toHaveBeenCalledTimes(1)
    expect(message4.acknowledge).toHaveBeenCalledTimes(1)
    expect(message5.acknowledge).toHaveBeenCalledTimes(1)
    expect(message6.acknowledge).toHaveBeenCalledTimes(1)
    expect(size()).toBe(0)

    // Messages must be confirmed in the order despite the fact the first message's processing got delayed.
    const messages = [message1, message2, message3, message4, message5, message6]

    messages.reduce((m1, m2) => {
      expect(timestamps[m1.transaction.lsn]).toBeLessThanOrEqual(timestamps[m2.transaction.lsn])
      return m2
    })

    dispose()
  })

  test(`when 'waitAfterFailedPublish' is set to non-zero or unspecified, then the queue must resend failed messages`, async () => {
    const timestamps: { [key: Lsn]: number } = {}
    const createMockMessage = (lsn: Lsn): MessageToPublish<InsertResult> => ({
      transaction: createMockTransaction(lsn),
      acknowledge: jest.fn<() => Promise<void>>().mockImplementation(() => {
        timestamps[lsn] = Date.now()
        return Promise.resolve()
      }),
    })

    const publishedMessages: Lsn[] = []
    let fails1 = 0
    let fails2 = 0
    let fails3 = 0
    const mockPublish = jest
      .fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>()
      .mockImplementation(async (message) => {
        if (message.transaction.lsn === '0/1' && fails1 < 2) {
          fails1++
          return Promise.reject(new Error())
        }

        if (message.transaction.lsn === '0/10' && fails2 < 1) {
          fails2++
          return Promise.reject(new Error())
        }

        if (message.transaction.lsn === '0/12' && fails2 < 1) {
          publishedMessages.push(message.transaction.lsn)
          await setTimeout(250)
          return Promise.resolve()
        }

        if (message.transaction.lsn === '0/30' && fails3 < 1) {
          fails3++
          return Promise.reject(new Error())
        }

        publishedMessages.push(message.transaction.lsn)

        return Promise.resolve()
      })

    const { queue, size, run, waitUntilIsEmpty, dispose } = createNonBlockingPublishingQueue(mockPublish, {
      waitAfterFailedPublish: Duration.ofMiliseconds(500),
    })

    const messages = Array(30)
      .fill(0)
      .map((_, i) => createMockMessage(`0/${i + 1}`))

    await Promise.all(messages.map((message) => run(queue(message))))
    await waitUntilIsEmpty()

    messages.forEach((message) => expect(message.acknowledge).toHaveBeenCalledTimes(1))

    const expectedOrder = [
      ...messages
        .filter(({ transaction: { lsn } }) => !['0/1', '0/10', '0/30'].includes(lsn))
        .map(({ transaction: { lsn } }) => lsn),
      '0/1',
      '0/10',
      '0/30',
    ]
    expect(publishedMessages).toEqual(expectedOrder)

    // expect(message5.acknowledge).toHaveBeenCalledTimes(1)
    // expect(message6.acknowledge).toHaveBeenCalledTimes(1)
    expect(size()).toBe(0)
    expect(fails1).toBe(2)
    expect(fails2).toBe(1)
    expect(fails3).toBe(1)

    dispose()
  })
})
