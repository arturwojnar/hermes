import { Bytes } from '../subscribeToReplicationSlot/types.js'

const offset = (offset = 0) => ({
  add: (bytes: Bytes) => (offset += bytes),
  addInt8: () => (offset += Bytes.Int8),
  addInt16: () => (offset += Bytes.Int16),
  addInt32: () => (offset += Bytes.Int32),
  addInt64: () => (offset += Bytes.Int64),
  value: () => offset,
})
type Offset = ReturnType<typeof offset>

export { offset, type Offset }
