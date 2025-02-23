import { describe, expect, jest, test } from '@jest/globals'
import { setTimeout } from 'node:timers/promises'
import { Lsn } from '../common/lsn.js'
import { InsertResult } from '../common/types.js'
import { Transaction } from '../subscribeToReplicationSlot/types.js'
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
    const queue = createNonBlockingPublishingQueue(mockPublish)

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/2')

    queue.queue(message1)
    queue.queue(message2)

    expect(queue.size()).toBe(2)
  })

  test('should ignore duplicate messages based on LSN', () => {
    const mockPublish = createMockPublish()
    const queue = createNonBlockingPublishingQueue(mockPublish)

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/1') // Same LSN

    queue.queue(message1)
    queue.queue(message2)

    expect(queue.size()).toBe(1)
  })

  test('should publish messages in FIFO order if proccessing time of each message is the same', async () => {
    const publishedMessages: Lsn[] = []
    const mockPublish = jest
      .fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>()
      .mockImplementation(async (message) => {
        publishedMessages.push(message.transaction.lsn)
      })

    const { queue, size, run } = createNonBlockingPublishingQueue(mockPublish)

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

    const { queue, size, run, waitUntilIsEmpty } = createNonBlockingPublishingQueue(mockPublish)

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
  })
})
