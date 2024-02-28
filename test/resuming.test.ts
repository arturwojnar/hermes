/* eslint-disable @typescript-eslint/no-floating-promises */

import { ObjectId } from 'mongodb'
import nodeTimersPromises from 'node:timers/promises'
import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts'
import { OutboxConsumer } from '../src/outbox'
import { MedicineEvent, generateEvent } from './events'
import { mongodb } from './mongodb'

test(`Outbox consumer should resume from the last processed message`, async () => {
  const publishEventStub = jest
    .fn()
    .mockResolvedValueOnce('1')
    .mockResolvedValueOnce('2')
    .mockResolvedValueOnce('3')
    .mockRejectedValue(new Error())

  await mongodb(async (client, onDispose) => {
    const db = client.db('test')
    const messagesCollection = db.collection(OutboxMessagesCollectionName)
    const consumersCollection = db.collection(OutboxConsumersCollectionName)
    const outbox = OutboxConsumer<MedicineEvent>({
      client,
      db,
      partitionKey: 'default',
      waitAfterFailedPublishMs: 10,
      shouldDisposeOnSigterm: false,
      publishEvent: publishEventStub,
    })
    const event1 = generateEvent('med1')
    const event2 = generateEvent('med2')
    const event3 = generateEvent('med3')
    const event4 = generateEvent('med4')
    const event5 = generateEvent('med5')

    const stop1 = await outbox.start()
    onDispose(stop1)

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

    await outbox.publishEvent(event1)
    await outbox.publishEvent(event2)
    await outbox.publishEvent(event3)
    await outbox.publishEvent(event4)
    await outbox.publishEvent(event5)

    await nodeTimersPromises.setTimeout(500)
    await stop1()

    const messages = await messagesCollection.find().toArray()
    expect(await consumersCollection.find().toArray()).toEqual([
      {
        _id: expect.any(ObjectId),
        lastProcessedId: messages[2]._id,
        resumeToken: expect.anything(),
        partitionKey: 'default',
        lastUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
      },
    ])

    publishEventStub.mockReset()
    const stop2 = await outbox.start()
    onDispose(stop2)

    await nodeTimersPromises.setTimeout(500)
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
