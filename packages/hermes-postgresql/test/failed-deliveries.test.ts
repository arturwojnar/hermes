// import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts.js'
import { Duration } from '@arturwojnar/hermes'
import { describe, expect, jest, test } from '@jest/globals'
import { setTimeout } from 'node:timers/promises'
import { convertLsnToBigInt, Lsn } from '../src/common/lsn.js'
import { createOutboxConsumer, HermesMessageEnvelope } from '../src/index.js'
import { generateEvent, MedicineEvent } from './events.js'
import { getRestartLsn } from './getRestartLsn.js'
import { postgres } from './postgresql.js'

jest.setTimeout(Duration.ofMinutes(5).ms)

describe(`Failed deliveries do not acknowledge related messages`, () => {
  test('for serialization off', async () => {
    await postgres(async (sql, container, onDispose) => {
      const messages: HermesMessageEnvelope<MedicineEvent>[][] = []
      const publishEventStub = jest
        .fn<(message: HermesMessageEnvelope<MedicineEvent> | HermesMessageEnvelope<MedicineEvent>[]) => Promise<void>>()
        .mockImplementationOnce(async (message) => {
          if (Array.isArray(message)) {
            messages.push(message)
          } else {
            messages.push([message])
          }

          await setTimeout(Duration.ofSeconds(2).ms)
          throw new Error('error-1')
        })
        .mockImplementation((message) => {
          if (Array.isArray(message)) {
            messages.push(message)
          } else {
            messages.push([message])
          }
          return Promise.resolve()
        })
      const outbox = createOutboxConsumer<MedicineEvent>({
        getOptions() {
          return {
            host: container.getHost(),
            port: container.getPort(),
            username: container.getUsername(),
            password: container.getPassword(),
            database: container.getDatabase(),
          }
        },
        publish: publishEventStub as any,
        consumerName: 'app',
        serialization: false,
      })

      const event1 = generateEvent('med1')
      const event2 = generateEvent('med2')
      const event3 = generateEvent('med3')
      const event4 = generateEvent('med4')
      const event5 = generateEvent('med5')
      const event6 = generateEvent('med6')

      const stop = await outbox.start()
      onDispose(stop)

      const initialLsn = await getRestartLsn(sql)

      const envelopes = [event1, event2, event3, event4, event5, event6].map((event, i) => ({
        message: event,
        messageId: `abc${i + 1}`,
        messageType: event.name,
      }))

      for (const envelope of envelopes) {
        await outbox.queue(envelope)
      }

      await setTimeout(Duration.ofMiliseconds(100).ms)

      await stop()

      expect(publishEventStub).toHaveBeenCalledTimes(6)

      let resultConsumer = await sql`select * from "outboxConsumer"`

      expect(resultConsumer).toHaveLength(1)

      const updatedLsn = resultConsumer[0].lastProcessedLsn as Lsn

      expect(updatedLsn).toBe(initialLsn)

      // starting again...
      await outbox.start()
      onDispose(stop)

      await setTimeout(Duration.ofMiliseconds(1000).ms)

      expect(publishEventStub).toHaveBeenCalledTimes(12)
      expect(
        messages
          .slice(0, 5)
          .map(([{ redeliveryCount }]) => redeliveryCount)
          .reduce((p, c) => p + c),
      ).toBe(0)
      // expect(messages.slice(6, 11).map(([{ redeliveryCount }]) => redeliveryCount)).toEqual([1, 1, 1, 1, 1, 1])
      resultConsumer = await sql`select * from "outboxConsumer"`
      expect(convertLsnToBigInt(resultConsumer[0].lastProcessedLsn)).toBeGreaterThan(convertLsnToBigInt(initialLsn))
      expect(resultConsumer[0].lastProcessedLsn).toBe(messages[messages.length - 1][0].lsn)

      await stop()
    })
  })
})
