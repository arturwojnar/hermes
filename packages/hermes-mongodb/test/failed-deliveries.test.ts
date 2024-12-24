import { Duration } from '@arturwojnar/hermes'
import { describe, expect, jest, test } from '@jest/globals'
import { ObjectId } from 'mongodb'
import nodeTimersPromises from 'node:timers/promises'
import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts.js'
import { createOutboxConsumer } from '../src/index.js'
import { generateEvent, type MedicineEvent } from './events.js'
import { mongodb } from './mongodb.js'

jest.setTimeout(Duration.ofMinutes(5).ms)

describe(`When a message publish fails`, () => {
  test('Then the outbox consumer if stopped should remember last processed message', async () => {
    const publishEventStub = jest
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error())

    await mongodb(async (db, client, onDispose) => {
      const messagesCollection = db.collection(OutboxMessagesCollectionName)
      const consumersCollection = db.collection(OutboxConsumersCollectionName)
      const outbox = createOutboxConsumer<MedicineEvent>({
        client,
        db,
        partitionKey: 'default',
        waitAfterFailedPublishMs: 10,
        shouldDisposeOnSigterm: false,
        publish: publishEventStub,
      })
      const event1 = generateEvent('med1')
      const event2 = generateEvent('med2')
      const event3 = generateEvent('med3')
      const event4 = generateEvent('med4')
      const event5 = generateEvent('med5')

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
          await outbox.publish(event1, session)
          await outbox.publish(event2, session)
          await outbox.publish(event3, session)
          await outbox.publish(event4, session)
          await outbox.publish(event5, session)
        })
      })

      await nodeTimersPromises.setTimeout(1000)
      await stop()

      const messages = await messagesCollection.find().toArray()
      expect(messages).toEqual([
        {
          _id: expect.any(ObjectId),
          partitionKey: 'default',
          occurredAt: expect.any(Date),
          data: event1,
        },
        {
          _id: expect.any(ObjectId),
          partitionKey: 'default',
          occurredAt: expect.any(Date),
          data: event2,
        },
        {
          _id: expect.any(ObjectId),
          partitionKey: 'default',
          occurredAt: expect.any(Date),
          data: event3,
        },
        {
          _id: expect.any(ObjectId),
          partitionKey: 'default',
          occurredAt: expect.any(Date),
          data: event4,
        },
        {
          _id: expect.any(ObjectId),
          partitionKey: 'default',
          occurredAt: expect.any(Date),
          data: event5,
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

  test(`Then the outbox consumer should attempt until it succeeds`, async () => {
    const publishEventStub = jest
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error())
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce()

    await mongodb(async (db, client, onDispose) => {
      const messagesCollection = db.collection(OutboxMessagesCollectionName)
      const consumersCollection = db.collection(OutboxConsumersCollectionName)
      const outbox = createOutboxConsumer<MedicineEvent>({
        client,
        db,
        partitionKey: 'default',
        waitAfterFailedPublishMs: 10,
        shouldDisposeOnSigterm: false,
        publish: publishEventStub,
      })
      const event1 = generateEvent('med1')
      const event2 = generateEvent('med2')
      const event3 = generateEvent('med3')
      const event4 = generateEvent('med4')
      const event5 = generateEvent('med5')

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
          await outbox.publish(event1, session)
          await outbox.publish(event2, session)
          await outbox.publish(event3, session)
          await outbox.publish(event4, session)
          await outbox.publish(event5, session)
        })
      })

      await nodeTimersPromises.setTimeout(1000)
      await stop()

      const messages = await messagesCollection.find().toArray()
      expect(await consumersCollection.find().toArray()).toEqual([
        {
          _id: expect.any(ObjectId),
          lastProcessedId: messages[4]._id,
          resumeToken: expect.anything(),
          partitionKey: 'default',
          lastUpdatedAt: expect.any(Date),
          createdAt: expect.any(Date),
        },
      ])
    })
  })
})
