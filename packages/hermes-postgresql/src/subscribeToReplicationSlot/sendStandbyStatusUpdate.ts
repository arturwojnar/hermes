import type { Writable } from 'node:stream'

import { toServerSystemClock } from '../common/helpers.js'
import type { Lsn } from '../common/lsn.js'
import { convertLsnToBigInt } from '../common/lsn.js'

// Standby status update (F)
// https://www.postgresql.org/docs/10/protocol-replication.html
const createStandbyStatusUpdate = (lastProcessedLsn: Lsn): Buffer => {
  // Calculate total size: 1 byte for message type + 4 * 8 bytes for Int64s + 1 byte for reply request
  const messageSize = 1 + 4 * 8 + 1
  const message = Buffer.alloc(messageSize)
  let offset = 0

  // Byte1('r') - Identifies the message as a standby status update
  message.write('r', offset)
  offset += 1

  // Parse LSN from format "X/Y" to separate upper and lower parts
  const lsnBigInt = convertLsnToBigInt(lastProcessedLsn)

  // Write the three LSN positions (all same value in this implementation)
  // - Last WAL byte + 1 received and written to disk
  // - Last WAL byte + 1 flushed to disk
  // - Last WAL byte + 1 applied
  for (let i = 0; i < 3; i++) {
    message.writeBigInt64BE(lsnBigInt, offset)
    offset += 8
  }

  // Write timestamp as microseconds since PostgreSQL epoch (2000-01-01)
  const systemClock = toServerSystemClock(Date.now())
  message.writeBigInt64BE(systemClock, offset)
  offset += 8

  // Write reply request flag (0 or 1)
  message.writeUInt8(0, offset)

  return message
}

const sendStandbyStatusUpdate = (stream: Writable, getLastAcknowledgedLsn: () => Lsn) => () => {
  if (!stream) {
    return
  }

  const statusUpdate = createStandbyStatusUpdate(getLastAcknowledgedLsn())

  stream.write(statusUpdate)
}

export { sendStandbyStatusUpdate }
