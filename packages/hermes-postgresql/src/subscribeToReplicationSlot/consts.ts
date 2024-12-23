// https://www.postgresql.org/docs/16/protocol-replication.html#PROTOCOL-REPLICATION-XLOGDATA

import { Bytes } from './types.js'

/*
 * Byte1('w'). Identifies the message as WAL data.
 * Int64. The starting point of the WAL data in this message.
 * Int64. The current end of WAL on the server.
 * Int64. The server's system clock at the time of transmission.
 * ByteN. A section of the WAL data stream.
 */
const XLogData_WalRecordStartByteNumber = Bytes.Int8 + Bytes.Int64 + Bytes.Int64 + Bytes.Int64

export { XLogData_WalRecordStartByteNumber }
