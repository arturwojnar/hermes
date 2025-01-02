import { Sql } from 'postgres'

type HermesMessageEnvelope<Message> = {
  position: number | bigint
  messageId: string
  messageType: string
  lsn: string
  message: Message
}

type MessageEnvelope<Message> = {
  messageId: string
  messageType: string
  message: Message
}

type InsertResult = {
  position: number | bigint
  messageId: string
  messageType: string
  partitionKey: string
  payload: string
}

type Start = () => Promise<Stop>
type Stop = () => Promise<void>
type Publish<Message> = (message: MessageEnvelope<Message> | MessageEnvelope<Message>[]) => Promise<void>
type IOutboxConsumer<Message> = {
  start: Start
  publish: Publish<Message>
  getDbConnection(): Sql
}
type NowFunction = () => Date
type ErrorCallback = (error: unknown) => void
type HermesSql = Sql<{
  bigint: bigint
}>

export type {
  ErrorCallback,
  HermesMessageEnvelope,
  HermesSql,
  InsertResult,
  IOutboxConsumer,
  MessageEnvelope,
  NowFunction,
  Publish,
  Start,
  Stop,
}
