type OutboxMessageModel<Event> = {
  _id: number
  occurredAt: Date
  data: Event
  partitionKey: string
  sentAt?: Date
}

export { OutboxMessageModel }
