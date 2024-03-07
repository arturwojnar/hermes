import { OutboxConsumersCollectionName } from '@arturwojnar/hermes'
import assert from 'assert'
import { Db, Document, ObjectId } from 'mongodb'
import { OutboxConsumerModel } from './typings'

type ConsumerActiveRecord<T extends Document, K extends keyof T = keyof T> = {
  [key in K]: T[key]
} & {
  update(lastProcessedId: ObjectId, resumeToken: unknown): Promise<void | never>
}

const getConsumer = async (db: Db, partitionKey: string): Promise<ConsumerActiveRecord<OutboxConsumerModel>> => {
  const consumers = db.collection<OutboxConsumerModel>(OutboxConsumersCollectionName)
  let consumer = await consumers.findOne({ partitionKey })

  if (!consumer) {
    consumer = {
      _id: new ObjectId(),
      lastProcessedId: null,
      resumeToken: undefined,
      partitionKey,
      lastUpdatedAt: null,
      createdAt: new Date(),
    }

    await consumers.insertOne(consumer)
  }

  const that = {
    async update(lastProcessedId: ObjectId, resumeToken: unknown) {
      assert(consumer)
      const { modifiedCount } = await consumers.updateOne(
        { _id: that._id },
        { $set: { lastProcessedId, resumeToken, lastUpdatedAt: new Date() } },
      )

      if (!modifiedCount) {
        throw new Error(`Cant update the consumer ${that._id.toString()}.`)
      }

      consumer.lastProcessedId = lastProcessedId
      consumer.resumeToken = resumeToken
    },
    async delete() {
      await consumers.deleteOne({ _id: that._id })
    },
    ...consumer,
  }

  return that
}

export { getConsumer }
