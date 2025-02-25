import { Db } from 'mongodb'
import { OutboxConsumersCollectionName } from './consts.js'
import { type OutboxConsumerModel } from './typings.js'

const ensureIndexes = async (db: Db) => {
  const consumers = db.collection<OutboxConsumerModel>(OutboxConsumersCollectionName)
  await consumers.createIndex({ partitionKey: 1 }, { unique: true, name: 'idx_partitionKey_asc' })
  // await messages.dropIndex('idx_eventNumber_desc')
  // await messages.createIndex({ partitionKey: 1 })
}

export { ensureIndexes }
