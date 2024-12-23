import type { AsyncOrSync } from 'ts-essentials'

type EventEnvelope<Event> = {
  position: number | bigint
  eventType: string
  lsn: string
  event: Event
}

type Publish = (event: EventEnvelope<Event> | EventEnvelope<Event>[]) => AsyncOrSync<void> | never

export { EventEnvelope, Publish }
