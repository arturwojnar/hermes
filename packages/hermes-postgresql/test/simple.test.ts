// import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts.js'
import { Duration } from '@arturwojnar/hermes'
import { describe, expect, jest, test } from '@jest/globals'
import { setTimeout } from 'node:timers/promises'
import { convertLsnToBigInt, Lsn } from '../src/common/lsn.js'
import { createOutboxConsumer } from '../src/index.js'
import { MedicineAdded, MedicineEvent } from './events.js'
import { getRestartLsn } from './getRestartLsn.js'
import { postgres } from './postgresql.js'

jest.setTimeout(Duration.ofMinutes(5).ms)

describe.each([true, false])('Sending one event works', (serialization) => {
  test(`when serialization is ${serialization ? 'on' : 'off'}`, async () => {
    await postgres(async (sql, container, onDispose) => {
      const publishEventStub = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const event: MedicineAdded = {
        name: 'MedicineAdded',
        data: {
          medicineId: 'med1',
          patientId: 'patient99',
        },
      }
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
        serialization,
      })

      const stop = await outbox.start()
      onDispose(stop)

      const initialLsn = await getRestartLsn(sql, 'app')

      expect(await sql`select * from "outbox"`).toHaveLength(0)
      expect(await sql`select * from "outboxConsumer"`).toEqual([
        {
          id: expect.any(String),
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

      await outbox.queue({
        message: event,
        messageId: 'abc1',
        messageType: event.name,
      })

      await setTimeout(500)

      expect(await sql`select * from "outbox"`).toEqual([
        expect.objectContaining({
          position: '1',
          messageId: 'abc1',
          messageType: 'MedicineAdded',
          partitionKey: 'default',
          // data: {},
          // addedAt: expect.any(String),
          // createdAt: expect.any(String),
        }),
      ])

      const resultConsumer = await sql`select * from "outboxConsumer"`

      expect(resultConsumer).toHaveLength(1)

      const updatedLsn = resultConsumer[0].lastProcessedLsn as Lsn

      expect(convertLsnToBigInt(updatedLsn)).toBeGreaterThan(convertLsnToBigInt(initialLsn))
    })
  })
})
