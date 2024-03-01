import { ChangeStreamInsertDocument, Db, MongoClient, ObjectId, ResumeToken } from 'mongodb'

type OutboxMessage<Event> = {
  _id: ObjectId
  occurredAt: Date
  // type: string
  data: Event
  // eventNumber: number
  partitionKey: string
}

type OutboxConsumer = {
  _id: ObjectId
  lastProcessedId: ObjectId | null
  resumeToken: ResumeToken
  partitionKey: string
  lastUpdatedAt: Date | null
  createdAt: Date
}

type ConsumerCreationParams<Event> = Readonly<{
  client: MongoClient
  db: Db
  partitionKey?: string
  waitAfterFailedPublishMs?: number
  shouldDisposeOnSigterm?: boolean // default true
  onError?: (error: Error) => void
  publishEvent: (event: Event) => Promise<void> | never
}>

type OutboxMessageStream<Event> = ChangeStreamInsertDocument<OutboxMessage<Event>>

export { ConsumerCreationParams, OutboxConsumer, OutboxMessage, OutboxMessageStream }
