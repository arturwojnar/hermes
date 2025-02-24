const PublicationName = `hermes_pub`
const SlotNamePrefix = `hermes_slot`

type SlotName = `${typeof SlotNamePrefix}_${string}_${string}`
const getSlotName = (consumerName: string, partitionKey: string): SlotName =>
  `${SlotNamePrefix}_${consumerName}_${partitionKey}`

export { getSlotName, PublicationName, type SlotName }
