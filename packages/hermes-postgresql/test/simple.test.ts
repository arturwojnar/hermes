// import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts.js'
import { expect, jest, test } from '@jest/globals'
import { setTimeout } from 'node:timers/promises'
import { Sql } from 'postgres'
import { convertLsnToBigInt, Lsn } from '../src/common/lsn.js'
import { createOutboxConsumer } from '../src/index.js'
import { MedicineAdded, MedicineEvent } from './events.js'
import { postgres } from './postgresql.js'

jest.setTimeout(5 * 60 * 1000)

const getRestartLsn = async (sql: Sql) => {
  const restartLsnResults = await sql<
    [{ restart_lsn: Lsn }]
  >`SELECT * FROM pg_replication_slots WHERE slot_name = 'hermes_slot';`
  return restartLsnResults?.[0]?.restart_lsn || '0/00000000'
}

test('Sending one event works', async () => {
  await postgres(async (sql, container, onDispose) => {
    // await migrate(sql)
    // await Promise.resolve()
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
    })

    const stop = await outbox.start()
    onDispose(stop)

    const initialLsn = await getRestartLsn(sql)

    expect(await sql`select * from "outbox"`).toHaveLength(0)
    expect(await sql`select * from "outboxConsumer"`).toEqual([
      {
        id: expect.any(String),
        consumerName: 'app',
        partitionKey: 'default',
        lastProcessedLsn: initialLsn,
        createdAt: expect.any(Date),
        lastUpdatedAt: expect.any(Date),
      },
    ])

    await outbox.publish({
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
