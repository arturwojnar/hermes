import { toTimestamp } from '../common/helpers.js'
import { constructLsn } from '../common/lsn.js'
import { offset } from '../common/offset.js'
import type { OnDataProcessingResult } from './types.js'
import { Bytes, MessageType, TopLevelType } from './types.js'

/*
 * https://www.postgresql.org/docs/current/protocol-logicalrep-message-formats.html#PROTOCOL-LOGICALREP-MESSAGE-FORMATS-INSERT
 * Byte1('B'). Identifies the message as a begin message.
 * Int64 (XLogRecPtr). The final LSN of the transaction. It represents the WAL position where the INSERT transaction was committed
 * Int64 (TimestampTz). Commit timestamp of the transaction. The value is in number of microseconds since PostgreSQL epoch (2000-01-01).
 * Int32 (TransactionId). Xid of the transaction.
 */
const processBeginMessage = (data: Buffer): OnDataProcessingResult => {
  const pos = offset(Bytes.Int8)
  // const lsn2 = constructLsn(data.readUInt32BE(pos.value()), data.readUInt32BE(pos.addInt32()))
  const lsn = constructLsn(data.subarray(1, 9))
  const timestamp = toTimestamp(data.readBigInt64BE(pos.addInt64()))
  const transactionId = data.readUInt32BE(pos.addInt64())

  return {
    topLevelType: TopLevelType.XLogData,
    messageType: MessageType.Begin,
    transactionId,
    lsn,
    timestamp,
  }
}

export { processBeginMessage }
