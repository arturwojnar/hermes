import type { AsyncOrSync } from 'ts-essentials'

type EventEnvelope<Event> = {
  position: number | bigint
  messageId: string
  messageType: string
  lsn: string
  event: Event
}

type Publish = (event: EventEnvelope<Event> | EventEnvelope<Event>[]) => AsyncOrSync<void> | never

type InsertResult = {
  position: number | bigint
  messageId: string
  messageType: string
  partitionKey: string
  payload: string
}

export type { EventEnvelope, InsertResult, Publish }
