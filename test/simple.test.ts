/* eslint-disable @typescript-eslint/no-floating-promises */

import { ObjectId } from 'mongodb'
import nodeTimersPromises from 'node:timers/promises'
import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts'
import { OutboxConsumer } from '../src/outbox'
import { MedicineAdded, MedicineEvent } from './events'
import { mongodb } from './mongodb'

test('Sending one event works', async () => {
  const publishEventStub = jest.fn().mockResolvedValue(undefined)

  await mongodb(async (db, client, onDispose) => {
    const messagesCollection = db.collection(OutboxMessagesCollectionName)
    const consumersCollection = db.collection(OutboxConsumersCollectionName)
    const outbox = OutboxConsumer<MedicineEvent>({
      client,
      db,
      publish: publishEventStub,
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
        lastUpdatedAt: null,
        createdAt: expect.any(Date),
        partitionKey: 'default',
      },
    ])

    await client.withSession(async (session) => {
      await session.withTransaction(async (session) => {
        await outbox.publish(event, session)
      })
    })

    await nodeTimersPromises.setTimeout(500)

    const messages = await messagesCollection.find().toArray()
    expect(messages).toEqual([
      {
        _id: expect.any(ObjectId),
        occurredAt: expect.any(Date),
        data: event,
        partitionKey: 'default',
      },
    ])
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

test('Sending many events works', async () => {
  const publishEventStub = jest.fn().mockResolvedValue(undefined)

  await mongodb(async (db, client, onDispose) => {
    const messagesCollection = db.collection(OutboxMessagesCollectionName)
    const consumersCollection = db.collection(OutboxConsumersCollectionName)
    const outbox = OutboxConsumer<MedicineEvent>({
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

    await outbox.publish([event1, event2])

    await nodeTimersPromises.setTimeout(500)

    const messages = await messagesCollection.find().toArray()
    expect(messages).toEqual([
      {
        _id: expect.any(ObjectId),
        occurredAt: expect.any(Date),
        data: event1,
        partitionKey: 'default',
      },
      {
        _id: expect.any(ObjectId),
        occurredAt: expect.any(Date),
        data: event2,
        partitionKey: 'default',
      },
    ])
    expect(await consumersCollection.find().toArray()).toEqual([
      {
        _id: expect.any(ObjectId),
        lastProcessedId: messages[1]._id,
        resumeToken: expect.anything(),
        lastUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
        partitionKey: 'default',
      },
    ])
  })
})

test('Using a callback works', async () => {
  const publishEventStub = jest.fn().mockResolvedValue(undefined)

  await mongodb(async (db, client, onDispose) => {
    const outbox = OutboxConsumer<MedicineEvent>({
      client,
      db,
      publish: publishEventStub,
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

    await outbox.publish(event, async (session, db) => {
      await db.collection('test').insertOne(
        {
          param: 1,
        },
        { session },
      )
    })

    await nodeTimersPromises.setTimeout(500)

    expect(await db.collection('test').find().toArray()).toEqual([
      {
        _id: expect.any(ObjectId),
        param: 1,
      },
    ])
  })
})

test('Event is not published when the callback fails', async () => {
  const publishEventStub = jest.fn().mockResolvedValue(undefined)

  await mongodb(async (db, client, onDispose) => {
    const consumersCollection = db.collection(OutboxConsumersCollectionName)
    const outbox = OutboxConsumer<MedicineEvent>({
      client,
      db,
      publish: publishEventStub,
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

    expect(async () => {
      await outbox.publish(event, async (session, db) => {
        await db.collection('test').insertOne(
          {
            param: 1,
          },
          { session },
        )
        throw new Error('test error')
      })
    }).rejects.toThrow()

    await nodeTimersPromises.setTimeout(500)

    expect(await db.collection('test').find().toArray()).toEqual([])
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
  })
})
