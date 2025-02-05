import { Sql, TransactionSql } from 'postgres'

type HermesMessageEnvelope<Message> = {
  position: number | bigint
  messageId: string
  messageType: string
  lsn: string
  redeliveryCount: number
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
type PublishOptions = {
  partitionKey?: string
  tx?: TransactionSql
}
type Publish<Message> = (
  message: MessageEnvelope<Message> | MessageEnvelope<Message>[],
  options?: PublishOptions,
) => Promise<void>
type IOutboxConsumer<Message> = {
  start: Start
  queue: Publish<Message>
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
  PublishOptions,
  Start,
  Stop,
}
