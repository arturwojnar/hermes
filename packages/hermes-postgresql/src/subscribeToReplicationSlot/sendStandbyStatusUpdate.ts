import type { Writable } from 'node:stream'

import { toServerSystemClock } from '../common/helpers.js'
import { incrementWAL, type Lsn } from '../common/lsn.js'

// Standby status update (F)
// https://www.postgrlesql.org/docs/10/protocol-replication.html
const createStandbyStatusUpdate = (lsn: Lsn): Buffer => {
  const x = Buffer.alloc(34)
  const lsnInt = incrementWAL(lsn)

  x[0] = 'r'.charCodeAt(0)
  x.writeBigUInt64BE(lsnInt, 1)
  x.writeBigInt64BE(toServerSystemClock(Date.now()), 25)
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
