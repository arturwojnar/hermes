// import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts.js'
import { Duration } from '@arturwojnar/hermes'
import { expect, jest, test } from '@jest/globals'
import { setTimeout } from 'node:timers/promises'
import { convertLsnToBigInt, isLsn, Lsn } from '../src/common/lsn.js'
import { createOutboxConsumer } from '../src/index.js'
import { HermesMessageEnvelope } from './common/types.js'
import { generateEvent, MedicineEvent } from './events.js'
import { getRestartLsn } from './getRestartLsn.js'
import { postgres } from './postgresql.js'

jest.setTimeout(Duration.ofMinutes(5).ms)

test('Sending many events at once in order works', async () => {
  await postgres(async (sql, container, onDispose) => {
    const publishEventStub = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
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
      publish: publishEventStub,
      consumerName: 'app',
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

    expect(await sql`select * from "outbox"`).toHaveLength(0)
    expect(await sql`select * from "outboxConsumer"`).toEqual([
      {
        id: '1',
        consumerName: 'app',
        partitionKey: 'default',
        lastProcessedLsn: initialLsn,
        createdAt: expect.any(Date),
        lastUpdatedAt: expect.any(Date),
        failedNextLsn: null,
        nextLsnRedeliveryCount: 0,
        status: 'CREATED',
      },
    ])

    const envelopes = [event1, event2, event3, event4, event5].map((event, i) => ({
      message: event,
      messageId: `abc${i + 1}`,
      messageType: event.name,
    }))

    for (const envelope of envelopes) {
      await outbox.queue(envelope)
    }

    await setTimeout(500)

    const results = await sql`select * from "outbox"`

    expect(results).toEqual([
      expect.objectContaining({
        position: '1',
        messageId: 'abc1',
        messageType: 'MedicineAdded',
        partitionKey: 'default',
        data: event1,
        addedAt: expect.any(Date),
        createdAt: expect.any(Date),
      }),
      expect.objectContaining({
        position: '2',
        messageId: 'abc2',
        messageType: 'MedicineAdded',
        partitionKey: 'default',
        data: event2,
        addedAt: expect.any(Date),
        createdAt: expect.any(Date),
      }),
      expect.objectContaining({
        position: '3',
        messageId: 'abc3',
        messageType: 'MedicineAdded',
        partitionKey: 'default',
        data: event3,
        addedAt: expect.any(Date),
        createdAt: expect.any(Date),
      }),
      expect.objectContaining({
        position: '4',
        messageId: 'abc4',
        messageType: 'MedicineAdded',
        partitionKey: 'default',
        data: event4,
        addedAt: expect.any(Date),
        createdAt: expect.any(Date),
      }),
      expect.objectContaining({
        position: '5',
        messageId: 'abc5',
        messageType: 'MedicineAdded',
        partitionKey: 'default',
        data: event5,
        addedAt: expect.any(Date),
        createdAt: expect.any(Date),
      }),
    ])

    expect(publishEventStub).toHaveBeenCalledTimes(5)

    const calls = publishEventStub.mock.calls as any as [[HermesMessageEnvelope<MedicineEvent>]][]

    for (let i = 0; i < envelopes.length; i++) {
      expect(calls[i][0][0].messageId).toBe(envelopes[i].messageId)
      expect(isLsn(calls[i][0][0].lsn)).toBeTruthy()
    }

    const publishLSNs = calls.map(([[{ lsn }]]) => convertLsnToBigInt(lsn as Lsn))

    expect(publishLSNs.sort((a, b) => (a - b < 0 ? -1 : a - b ? 1 : 0))).toEqual(publishLSNs)

    const resultConsumer = await sql`select * from "outboxConsumer"`

    expect(resultConsumer).toHaveLength(1)

    const updatedLsn = resultConsumer[0].lastProcessedLsn as Lsn

    expect(convertLsnToBigInt(updatedLsn)).toBe(publishLSNs[publishLSNs.length - 1])
    expect(convertLsnToBigInt(updatedLsn)).toBeGreaterThan(convertLsnToBigInt(initialLsn))

    await outbox.queue({
      message: event6,
      messageId: `abc6`,
      messageType: event6.name,
    })

    await setTimeout(250)

    expect(publishEventStub).toHaveBeenCalledTimes(6)
  })
})
