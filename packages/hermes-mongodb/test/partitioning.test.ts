/* eslint-disable @typescript-eslint/no-floating-promises */

import { expect, jest } from '@jest/globals'
import { ObjectId } from 'mongodb'
import nodeTimersPromises from 'node:timers/promises'
import { createOutboxConsumer } from '../src'
import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts'
import { generateEvent, type MedicineEvent } from './events'
import { mongodb } from './mongodb'
import { Duration } from '@arturwojnar/hermes'

jest.setTimeout(Duration.ofMinutes(5).ms)

test('Partitioning works', async () => {
  const publishEventStub = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)

  await mongodb(async (db, client, onDispose) => {
    const messagesCollection = db.collection(OutboxMessagesCollectionName)
    const consumersCollection = db.collection(OutboxConsumersCollectionName)
    const outbox1 = createOutboxConsumer<MedicineEvent>({
      client,
      db,
      partitionKey: 'tenant-1',
      publish: publishEventStub,
      shouldDisposeOnSigterm: false,
    })
    const outbox2 = createOutboxConsumer<MedicineEvent>({
      client,
      db,
      partitionKey: 'tenant-2',
      publish: publishEventStub,
      shouldDisposeOnSigterm: false,
    })
    const event1 = generateEvent('med1')
    const event2 = generateEvent('med2')
    const event3 = generateEvent('med3')
    const event4 = generateEvent('med4')
    const event5 = generateEvent('med5')

    onDispose(await outbox1.start())
    onDispose(await outbox2.start())

    expect(await messagesCollection.find().toArray()).toEqual([])
    expect(await consumersCollection.find().toArray()).toEqual([
      {
        _id: expect.any(ObjectId),
        lastProcessedId: null,
        resumeToken: null,
        partitionKey: 'tenant-1',
        lastUpdatedAt: null,
        createdAt: expect.any(Date),
      },
      {
        _id: expect.any(ObjectId),
        lastProcessedId: null,
        resumeToken: null,
        partitionKey: 'tenant-2',
        lastUpdatedAt: null,
        createdAt: expect.any(Date),
      },
    ])

    await outbox1.publish(event1)
    await outbox2.publish(event2)
    await outbox1.publish(event3)
    await outbox2.publish(event4)
    await outbox1.publish(event5)

    await nodeTimersPromises.setTimeout(200)

    const messages = await messagesCollection.find().toArray()
    expect(messages).toEqual([
      {
        _id: expect.any(ObjectId),
        partitionKey: 'tenant-1',
        occurredAt: expect.any(Date),
        data: event1,
      },
      {
        _id: expect.any(ObjectId),
        partitionKey: 'tenant-2',
        occurredAt: expect.any(Date),
        data: event2,
      },
      {
        _id: expect.any(ObjectId),
        partitionKey: 'tenant-1',
        occurredAt: expect.any(Date),
        data: event3,
      },
      {
        _id: expect.any(ObjectId),
        partitionKey: 'tenant-2',
        occurredAt: expect.any(Date),
        data: event4,
      },
      {
        _id: expect.any(ObjectId),
        partitionKey: 'tenant-1',
        occurredAt: expect.any(Date),
        data: event5,
      },
    ])
    expect(await consumersCollection.find().toArray()).toEqual([
      {
        _id: expect.any(ObjectId),
        lastProcessedId: messages[4]._id,
        resumeToken: expect.anything(),
        partitionKey: 'tenant-1',
        lastUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
      },
      {
        _id: expect.any(ObjectId),
        lastProcessedId: messages[3]._id,
        resumeToken: expect.anything(),
        partitionKey: 'tenant-2',
        lastUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
      },
    ])
  })
})
