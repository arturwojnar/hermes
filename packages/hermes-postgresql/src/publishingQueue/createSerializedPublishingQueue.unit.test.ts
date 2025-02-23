import { Duration } from '@arturwojnar/hermes'
import { describe, expect, it, jest } from '@jest/globals'
import { setTimeout as setTimeoutCallback } from 'timers'
import { setTimeout } from 'timers/promises'
import { Lsn } from '../common/lsn.js'
import { InsertResult } from '../common/types.js'
import { Transaction } from '../subscribeToReplicationSlot/types.js'
import { type MessageToPublish, createSerializedPublishingQueue } from './createSerializedPublishingQueue.js'

describe('publishingQueue', () => {
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

  it('should queue unique messages', () => {
    const mockPublish = createMockPublish()
    const queue = createSerializedPublishingQueue(mockPublish)

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/2')

    queue.queue(message1)
    queue.queue(message2)

    expect(queue.size()).toBe(2)
  })

  it('should ignore duplicate messages based on LSN', () => {
    const mockPublish = createMockPublish()
    const queue = createSerializedPublishingQueue(mockPublish)

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/1') // Same LSN

    queue.queue(message1)
    queue.queue(message2)

    expect(queue.size()).toBe(1)
  })

  it('should publish messages in FIFO order', async () => {
    const publishedMessages: Lsn[] = []
    const mockPublish = jest
      .fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>()
      .mockImplementation(async (message) => {
        publishedMessages.push(message.transaction.lsn)
      })

    const { queue, size, run } = createSerializedPublishingQueue(mockPublish)

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/2')
    const message3 = createMockMessage('0/3')
    const message4 = createMockMessage('0/4')

    queue(message1)
    queue(message2)
    queue(message3)
    queue(message4)

    await run()

    expect(publishedMessages).toEqual(['0/1', '0/2', '0/3', '0/4'])

    expect(size()).toBe(0)
  })

  it('should continue publishing after failed messages', async () => {
    const mockError = new Error('Publish failed')
    const publishedMessages: Lsn[] = []
    const mockPublish = jest
      .fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>()
      .mockImplementationOnce(async () => {
        throw mockError
      })
      .mockImplementation(async (message) => {
        publishedMessages.push(message.transaction.lsn)
      })

    const mockFailedPublishCallback = jest
      .fn(async (tx: Transaction<InsertResult>): Promise<void> => {})
      .mockImplementation(async (tx: Transaction<InsertResult>): Promise<void> => {
        return Promise.resolve()
      })
    const { queue, run } = createSerializedPublishingQueue(mockPublish, {
      waitAfterFailedPublish: Duration.ofMiliseconds(1),
      onFailedPublish: mockFailedPublishCallback,
    })

    const message1 = createMockMessage('0/1')
    const message2 = createMockMessage('0/2')
    const message3 = createMockMessage('0/3')

    queue(message1)
    queue(message2)
    queue(message3)

    await run()

    // First message should have had a failed attempt before succeeding
    expect(mockFailedPublishCallback).toHaveBeenCalledWith(message1.transaction)
    expect(mockFailedPublishCallback).toHaveBeenCalledTimes(1)

    // All messages should eventually be processed successfully
    expect(publishedMessages).toEqual(['0/1', '0/2', '0/3'])
    expect(message1.acknowledge).toHaveBeenCalledTimes(1)
    expect(message2.acknowledge).toHaveBeenCalledTimes(1)
    expect(message3.acknowledge).toHaveBeenCalledTimes(1)
  })

  it('should keep retrying failed message until success', async () => {
    const mockError = new Error('Publish failed')
    const publishedMessages: Lsn[] = []
    const mockPublish = jest
      .fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>()
      .mockRejectedValueOnce(mockError)
      .mockRejectedValueOnce(mockError)
      .mockImplementation(async (message) => {
        publishedMessages.push(message.transaction.lsn)
      })

    const mockFailedPublishCallback = jest
      .fn(async (tx: Transaction<InsertResult>): Promise<void> => {})
      .mockImplementation(async (tx: Transaction<InsertResult>): Promise<void> => {
        return Promise.resolve()
      })
    const { queue, run } = createSerializedPublishingQueue(mockPublish, {
      waitAfterFailedPublish: Duration.ofMiliseconds(10),
      onFailedPublish: mockFailedPublishCallback,
    })

    const message = createMockMessage('0/1')

    queue(message)
    await run()

    expect(mockPublish).toHaveBeenCalledTimes(3)
    expect(mockFailedPublishCallback).toHaveBeenCalledTimes(2)
    expect(publishedMessages).toEqual(['0/1'])
    expect(message.acknowledge).toHaveBeenCalledTimes(1)
  })

  it('should publish all queued messages until queue is empty', async () => {
    const publishedMessages: Lsn[] = []
    const mockPublish = jest
      .fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>()
      .mockImplementation(async (message) => {
        await setTimeout(100)
        publishedMessages.push(message.transaction.lsn)
      })
    const { queue, run } = createSerializedPublishingQueue(mockPublish)

    const messages = [
      createMockMessage('0/1'),
      createMockMessage('0/2'),
      createMockMessage('0/3'),
      createMockMessage('0/4'),
      createMockMessage('0/5'),
    ]
    const laterMessage = createMockMessage('0/100')

    messages.forEach((msg) => queue(msg))

    // add a message in the meantime
    setTimeoutCallback(() => {
      queue(laterMessage)
    }, 330)

    const anotherMessage = createMockMessage('0/50')
    queue(anotherMessage)

    await run()

    expect(mockPublish).toHaveBeenCalledTimes(7)

    expect(publishedMessages).toEqual(['0/1', '0/2', '0/3', '0/4', '0/5', '0/50', '0/100'])
    messages.forEach((message) => expect(message.acknowledge).toHaveBeenCalledTimes(1))
    expect(anotherMessage.acknowledge).toHaveBeenCalledTimes(1)
    expect(laterMessage.acknowledge).toHaveBeenCalledTimes(1)
  })

  it('should prevent concurrent publishing', async () => {
    const mockPublish = jest
      .fn<(messageToPublish: MessageToPublish<InsertResult>) => Promise<void>>()
      .mockImplementation(async () => await setTimeout(100))

    const { queue, run } = createSerializedPublishingQueue(mockPublish)

    // Start two concurrent publish operations
    queue(createMockMessage('0/1'))
    queue(createMockMessage('0/2'))

    await run()

    // Should only have published each message once despite concurrent calls
    expect(mockPublish).toHaveBeenCalledTimes(2)
  })
})
