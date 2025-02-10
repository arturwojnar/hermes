import { JSONValue, Sql, TransactionSql } from 'postgres'
import { DeepReadonly } from 'ts-essentials'
import { ConsumerCreationParams } from './ConsumerCreationParams.js'

type HermesMessageEnvelope<Message extends JSONValue> = {
  position: number | bigint
  messageId: string
  messageType: string
  lsn: string
  redeliveryCount: number
  message: Message
}

type MessageEnvelope<Message extends JSONValue> = {
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
type Publish<Message extends JSONValue> = (
  message: MessageEnvelope<Message> | MessageEnvelope<Message>[],
  options?: PublishOptions,
) => Promise<void>
type IOutboxConsumer<Message extends JSONValue> = {
  start: Start
  queue: Publish<Message>
  send: (message: MessageEnvelope<Message> | MessageEnvelope<Message>[], tx?: TransactionSql) => Promise<void>
  getDbConnection(): Sql
  getCreationParams(): DeepReadonly<ConsumerCreationParams<Message>>
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
