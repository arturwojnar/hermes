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

  await mongodb(async (db, client, onDispose) => {
    const messagesCollection = db.collection(OutboxMessagesCollectionName)
    const consumersCollection = db.collection(OutboxConsumersCollectionName)
    const outbox = OutboxConsumer<MedicineEvent>({
      client,
      db,
      waitAfterFailedPublishMs: 10,
      shouldDisposeOnSigterm: false,
      publish: publishEventStub,
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
        lastUpdatedAt: null,
        createdAt: expect.any(Date),
        partitionKey: 'default',
      },
    ])

    await outbox.publish(event1)
    await outbox.publish(event2)
    await outbox.publish(event3)
    await outbox.publish(event4)
    await outbox.publish(event5)

    await nodeTimersPromises.setTimeout(500)
    await stop1()

    const messages = await messagesCollection.find().toArray()
    expect(await consumersCollection.find().toArray()).toEqual([
      {
        _id: expect.any(ObjectId),
        lastProcessedId: messages[2]._id,
        resumeToken: expect.anything(),
        lastUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
        partitionKey: 'default',
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
        lastUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
        partitionKey: 'default',
      },
    ])
  })
})
