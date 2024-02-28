/* eslint-disable @typescript-eslint/no-floating-promises */

import { ObjectId } from 'mongodb'
import nodeTimersPromises from 'node:timers/promises'
import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts'
import { OutboxConsumer } from '../src/outbox'
import { MedicineAdded, MedicineEvent } from './events'
import { mongodb } from './mongodb'

test('Sending one event works', async () => {
  const publishEventStub = jest.fn().mockResolvedValue(undefined)

  await mongodb(async (client, onDispose) => {
    const db = client.db('test')
    const messagesCollection = db.collection(OutboxMessagesCollectionName)
    const consumersCollection = db.collection(OutboxConsumersCollectionName)
    const outbox = OutboxConsumer<MedicineEvent>({
      client,
      db,
      partitionKey: 'default',
      publishEvent: publishEventStub,
      shouldDisposeOnSigterm: false,
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
        partitionKey: 'default',
        lastUpdatedAt: null,
        createdAt: expect.any(Date),
      },
    ])

    await client.withSession(async (session) => {
      await session.withTransaction(async (session) => {
        await outbox.publishEvent(event, session)
      })
    })

    await nodeTimersPromises.setTimeout(500)

    const messages = await messagesCollection.find().toArray()
    expect(messages).toEqual([
      {
        _id: expect.any(ObjectId),
        partitionKey: 'default',
        occurredAt: expect.any(Date),
        data: event,
      },
    ])
    expect(await consumersCollection.find().toArray()).toEqual([
      {
        _id: expect.any(ObjectId),
        lastProcessedId: messages[0]._id,
        resumeToken: expect.anything(),
        partitionKey: 'default',
        lastUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
      },
    ])
  })
})
