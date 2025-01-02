import { Sql } from 'postgres'

type EventEnvelope<Event> = {
  position: number | bigint
  messageId: string
  messageType: string
  lsn: string
  event: Event
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
type Publish<Event> = (event: EventEnvelope<Event> | EventEnvelope<Event>[]) => Promise<void>
type IOutboxConsumer<Event> = {
  start: Start
  publish: Publish<Event>
  getDbConnection(): Sql
}
type NowFunction = () => Date
type ErrorCallback = (error: unknown) => void
type HermesSql = Sql<{
  bigint: bigint
}>

export type {
  ErrorCallback,
  EventEnvelope,
  HermesSql,
  InsertResult,
  IOutboxConsumer,
  NowFunction,
  Publish,
  Start,
  Stop,
}
