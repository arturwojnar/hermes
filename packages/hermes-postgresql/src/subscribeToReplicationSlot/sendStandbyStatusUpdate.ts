import type { Writable } from 'node:stream'

import { toServerSystemClock } from '../common/helpers.js'
import { incrementWAL, type Lsn } from '../common/lsn.js'
import { offset } from '../common/offset.js'
import { Bytes } from './types.js'

// Standby status update (F)
// https://www.postgresql.org/docs/current/protocol-replication.html#PROTOCOL-REPLICATION-STANDBY-STATUS-UPDATE
const createStandbyStatusUpdate = (lsn: Lsn): Buffer => {
  const x = Buffer.alloc(34)
  const pos = offset(Bytes.Int8)
  const lsnInt = incrementWAL(lsn)

  x[0] = 'r'.charCodeAt(0)
  x.writeBigUInt64BE(lsnInt, pos.value())
  x.writeBigUInt64BE(lsnInt, pos.addInt64())
  x.writeBigUInt64BE(lsnInt, pos.addInt64())
  x.writeBigInt64BE(toServerSystemClock(Date.now()), pos.addInt64())
  x.writeUInt8(0, pos.addInt8())

  return x
}

const sendStandbyStatusUpdate = (stream: Writable, getLastAcknowledgedLsn: () => Lsn) => () => {
  if (!stream) {
    return
  }

  const statusUpdate = createStandbyStatusUpdate(getLastAcknowledgedLsn())

  stream.write(statusUpdate)
}

export { sendStandbyStatusUpdate }
