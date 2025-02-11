import { Duration } from '@arturwojnar/hermes'
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import { setTimeout } from 'node:timers/promises'
import postgres, { JSONValue } from 'postgres'
import { AsyncOutboxConsumer, HermesAsyncMessageEnvelope } from './AsyncOutboxConsumer.js'

// Mock the postgres sql template literal function
const mockJsonValue = {
  type: 1,
  value: '{}',
  raw: '{}',
}
const createMockSql = () => {
  const sql = jest.fn<(...p: string[]) => postgres.RowList<postgres.Row[]>>()

  Object.assign(sql, {
    end: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    json: jest.fn<(p: JSONValue) => postgres.Parameter>().mockReturnValue(mockJsonValue as any),
  })
  return sql
}

const createPublish = () => {
  return jest
    .fn<(message: HermesAsyncMessageEnvelope<any> | HermesAsyncMessageEnvelope<any>[]) => Promise<void>>()
    .mockResolvedValue(undefined)
}

describe('AsyncOutboxConsumer', () => {
  const defaultParams = {
    getSql: () => createMockSql(),
    publish: createPublish(),
    consumerName: 'test-consumer',
    checkInterval: Duration.ofSeconds(1),
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(global, 'setInterval')
    jest.spyOn(global, 'clearInterval')
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  describe('send', () => {
    test('should insert message into asyncOutbox table', async () => {
      const mockSql = createMockSql()
      const consumer = new AsyncOutboxConsumer({
        ...defaultParams,
        getSql: () => mockSql as any,
      })

      const message = {
        messageId: 'test-id',
        messageType: 'test-type',
        message: { data: 'test-data' },
      }

      await consumer.send(message)

      expect(mockSql).toHaveBeenCalledWith(
        [
          expect.stringContaining('INSERT INTO "asyncOutbox"'),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
        ],
        defaultParams.consumerName,
        message.messageId,
        message.messageType,
        mockJsonValue,
      )
    })

    test('should throw error if consumer not started', async () => {
      const consumer = new AsyncOutboxConsumer({
        ...defaultParams,
        getSql: () => undefined as any,
      })

      await expect(
        consumer.send({
          messageId: 'test',
          messageType: 'test',
          message: {},
        }),
      ).rejects.toThrow('Database connection not established')
    })
  })

  describe('start/stop', () => {
    test('should start polling when consumer is started', async () => {
      const consumer = new AsyncOutboxConsumer(defaultParams as any)

      const result = consumer.start()

      expect(typeof result).toBe('function')
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), defaultParams.checkInterval.ms)
    })

    test('should not start polling if already started', async () => {
      const consumer = new AsyncOutboxConsumer(defaultParams as any)

      consumer.start()
      expect(() => consumer.start()).toThrowError()
      expect(setInterval).toHaveBeenCalledTimes(1)
    })

    test('should stop polling and close connection when stopped', async () => {
      const mockSql = createMockSql()
      const consumer = new AsyncOutboxConsumer({
        ...defaultParams,
        getSql: () => mockSql as any,
      })

      consumer.start()
      await consumer.stop()

      expect(clearInterval).toHaveBeenCalled()
    })
  })

  describe('message processing', () => {
    test('should process undelivered messages', async () => {
      const mockSql = createMockSql()
      const mockPublish = jest
        .fn<(message: HermesAsyncMessageEnvelope<any> | HermesAsyncMessageEnvelope<any>[]) => Promise<void>>()
        .mockResolvedValue(undefined)
      const pendingMessages = [
        {
          position: 1,
          messageId: 'msg1',
          messageType: 'type1',
          data: { value: 'test1' },
          failsCount: 0,
        },
        {
          position: 2,
          messageId: 'msg2',
          messageType: 'type2',
          data: { value: 'test2' },
          failsCount: 0,
        },
      ]

      mockSql.mockImplementation(() => pendingMessages as any)

      const consumer = new AsyncOutboxConsumer({
        ...defaultParams,
        getSql: () => mockSql as any,
        publish: mockPublish,
      })

      consumer.start()
      jest.advanceTimersByTime(defaultParams.checkInterval.ms)

      // Wait for promises to resolve
      await setTimeout(Duration.ofSeconds(1).ms)

      expect(mockPublish).toHaveBeenCalledTimes(2)
      expect(mockPublish).toHaveBeenCalledWith({
        position: pendingMessages[0].position,
        messageId: pendingMessages[0].messageId,
        messageType: pendingMessages[0].messageType,
        message: pendingMessages[0].data,
        redeliveryCount: 0,
      })
    })

    test('should handle failed message delivery', async () => {
      const mockSql = createMockSql()
      const mockPublish = jest.fn<() => Promise<Error>>().mockRejectedValue(new Error('Publish failed'))
      const pendingMessage = {
        position: 1,
        messageId: 'msg1',
        messageType: 'type1',
        data: { value: 'test1' },
        failsCount: 0,
      }

      mockSql.mockImplementation(() => [pendingMessage] as any)

      const consumer = new AsyncOutboxConsumer({
        ...defaultParams,
        getSql: () => mockSql as any,
        publish: mockPublish as any,
      })

      consumer.start()
      jest.advanceTimersByTime(defaultParams.checkInterval.ms)

      // Wait for promises to resolve
      await setTimeout(Duration.ofSeconds(1).ms)

      expect(mockSql).toHaveBeenCalledWith(
        [expect.stringContaining('UPDATE "asyncOutbox"'), expect.any(String)],
        pendingMessage.position,
      )
    })

    test('should not process messages if already processing', async () => {
      const mockSql = createMockSql()
      const mockPublish = jest.fn().mockImplementation(async () => {
        // Simulate long-running publish
        await setTimeout(Duration.ofSeconds(1).ms)
      })

      mockSql.mockImplementation(
        () =>
          [
            {
              position: 1,
              messageId: 'msg1',
              messageType: 'type1',
              data: { value: 'test1' },
              failsCount: 0,
            },
          ] as any,
      )

      const consumer = new AsyncOutboxConsumer({
        ...defaultParams,
        getSql: () => mockSql as any,
        publish: mockPublish as any,
      })

      consumer.start()

      // Trigger multiple intervals while the first processing is still running
      jest.advanceTimersByTime(defaultParams.checkInterval.ms * 3)

      await setTimeout(Duration.ofMiliseconds(500).ms)

      // Should only start processing once
      expect(mockPublish).toHaveBeenCalledTimes(1)
    })
  })
})
