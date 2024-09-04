/* eslint-disable @typescript-eslint/no-floating-promises */

import { Duration, swallow } from '@arturwojnar/hermes'
import { expect, jest } from '@jest/globals'
import nodeTimersPromises from 'node:timers/promises'
import { createOutboxConsumer } from '../src'
import { OutboxMessagesCollectionName } from '../src/consts'
import { MedicineAdded, type MedicineEvent } from './events'
import { mongodb } from './mongodb'

jest.setTimeout(Duration.ofMinutes(5).ms)

test('withScope creates a scoped callback to a transaction', async () => {
  const publishEventStub = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)

  await mongodb(async (db, client, onDispose) => {
    const messagesCollection = db.collection(OutboxMessagesCollectionName)
    const outbox = createOutboxConsumer<MedicineEvent>({
      client,
      db,
      publish: publishEventStub,
      shouldDisposeOnSigterm: false,
    })
    const event1: MedicineAdded = {
      name: 'MedicineAdded',
      data: {
        medicineId: 'med1',
        patientId: 'patient99',
      },
    }
    const event2: MedicineAdded = {
      name: 'MedicineAdded',
      data: {
        medicineId: 'med2',
        patientId: 'patient100',
      },
    }

    const stop = await outbox.start()
    onDispose(stop)

    expect(await messagesCollection.find().toArray()).toEqual([])

    await outbox.withScope(async ({ publish }) => {
      await publish(event1)
      await publish(event2)
    })

    await nodeTimersPromises.setTimeout(Duration.ofMiliseconds(200).ms)

    expect(await messagesCollection.countDocuments({})).toBe(2)

    await swallow(() =>
      outbox.withScope(async ({ publish }) => {
        await publish(event1)
        await publish(event2)
        throw new Error(`Unexpected! :)`)
      }),
    )

    expect(await messagesCollection.countDocuments({})).toBe(2)
  })
})
