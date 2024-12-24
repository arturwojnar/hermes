import { Duration } from '@arturwojnar/hermes'
import { expect, jest, test } from '@jest/globals'
import { ObjectId } from 'mongodb'
import nodeTimersPromises from 'node:timers/promises'
import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts.js'
import { createOutboxConsumer } from '../src/index.js'
import { type MedicineAdded, type MedicineEvent } from './events.js'
import { mongodb } from './mongodb.js'

jest.setTimeout(Duration.ofMinutes(5).ms)

test('If option `saveTimestamps` is on, then sent events are marked with timestamps', async () => {
  const publishEventStub = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)

  await mongodb(async (db, client, onDispose) => {
    const messagesCollection = db.collection(OutboxMessagesCollectionName)
    const consumersCollection = db.collection(OutboxConsumersCollectionName)
    const outbox = createOutboxConsumer<MedicineEvent>({
      client,
      db,
      publish: publishEventStub,
      shouldDisposeOnSigterm: false,
      saveTimestamps: true,
      now: () => new Date('2024-04-03 15:00:00'),
    })
    const event: MedicineAdded = {
      name: 'MedicineAdded',
      data: {
        medicineId: 'med1',
        patientId: 'patient99',
      },
    }

    const stop = await outbox.start()
    onDispose(stop)

    expect(await messagesCollection.find().toArray()).toEqual([])
    expect(await consumersCollection.find().toArray()).toEqual([
      {
        _id: expect.any(ObjectId),
        lastProcessedId: null,
        resumeToken: null,
        lastUpdatedAt: null,
        createdAt: expect.any(Date),
        partitionKey: 'default',
      },
    ])

    await outbox.publish(event)

    await nodeTimersPromises.setTimeout(200)

    const messages = await messagesCollection.find().toArray()
    expect(messages).toEqual([
      {
        _id: expect.any(ObjectId),
        occurredAt: expect.any(Date),
        data: event,
        partitionKey: 'default',
        sentAt: new Date('2024-04-03 15:00:00'),
      },
    ])
    expect(messages[0].sentAt)
    expect(await consumersCollection.find().toArray()).toEqual([
      {
        _id: expect.any(ObjectId),
        lastProcessedId: messages[0]._id,
        resumeToken: expect.anything(),
        lastUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
        partitionKey: 'default',
      },
    ])
  })
})
