import { toTimestamp } from '../common/helpers'
import { offset } from '../common/offset'
import type { OnDataProcessingResult } from './types'
import { Bytes, MessageType, TopLevelType } from './types'

/*
 * Byte1('C'). Identifies the message as a commit message.
 * Int8(0). Flags; currently unused.
 * Int64 (XLogRecPtr). The LSN of the commit.
 * Int64 (XLogRecPtr). The end LSN of the transaction.
 * Int64 (TimestampTz). Commit timestamp of the transaction. The value is in number of microseconds since PostgreSQL epoch (2000-01-01).
 */
const processCommitMessage = (data: Buffer): OnDataProcessingResult => {
  const pos = offset(Bytes.Int8 + Bytes.Int8 + Bytes.Int64 + Bytes.Int64)
  // const lsn = `${data.readInt32BE(pos.value())}/${data.readInt32BE(pos.addInt32())}`
  // Skip end LSN and timestamp as we don't need them for this use case
  // const endLsn = data.readBigInt64BE(pos.addInt32())
  const commitTimestamp = toTimestamp(data.readBigInt64BE(pos.value()))

  // The transaction ID should be available from the context of the current transaction
  // We'll need to track this separately
  return {
    topLevelType: TopLevelType.XLogData,
    messageType: MessageType.Commit,
    commitTimestamp,
  }
}

export { processCommitMessage }
