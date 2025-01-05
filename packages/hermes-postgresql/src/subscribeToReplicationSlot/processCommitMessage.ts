import { toTimestamp } from '../common/helpers.js'
import { constructLsn } from '../common/lsn.js'
import { offset } from '../common/offset.js'
import type { OnDataProcessingResult } from './types.js'
import { Bytes, MessageType, TopLevelType } from './types.js'

/*
 * Byte1('C'). Identifies the message as a commit message.
 * Int8(0). Flags; currently unused.
 * Int64 (XLogRecPtr). The LSN of the commit.
 * Int64 (XLogRecPtr). The end LSN of the transaction.
 * Int64 (TimestampTz). Commit timestamp of the transaction. The value is in number of microseconds since PostgreSQL epoch (2000-01-01).
 */
const processCommitMessage = <InsertResult>(data: Buffer): OnDataProcessingResult<InsertResult> => {
  const pos = offset(Bytes.Int8 + Bytes.Int8)
  const commitLsn = constructLsn(data.subarray(pos.value(), pos.addInt64()))
  const transactionEndLsn = constructLsn(data.subarray(pos.value(), pos.addInt64()))
  // const commitLsn = constructLsn(data.readUInt32BE(pos.value()), data.readUInt32BE(pos.addInt32()))
  // const transactionEndLsn = constructLsn(data.subarray(pos.value(), pos.))
  const commitTimestamp = toTimestamp(data.readBigInt64BE(pos.value()))

  // The transaction ID should be available from the context of the current transaction
  // We'll need to track this separately
  return {
    topLevelType: TopLevelType.XLogData,
    messageType: MessageType.Commit,
    commitLsn,
    transactionEndLsn,
    commitTimestamp,
  }
}

export { processCommitMessage }
