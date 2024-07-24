/* eslint-disable  @typescript-eslint/no-unused-vars  */
/* eslint-disable  @typescript-eslint/no-unsafe-argument  */
/* eslint-disable  @typescript-eslint/no-unsafe-call  */
/* eslint-disable  @typescript-eslint/no-unsafe-member-access  */
import { assertNever, noop } from '@arturwojnar/hermes'
import { assert } from 'console'
import { Sql } from 'postgres'
import { AsyncOrSync } from 'ts-essentials'

type Lsn = Uint8Array
type LogicalReplicationState = {
  lastProcessedLsn: Lsn
  timestamp: Date
  publication: string
  slotName: string
}
type Transaction = { transactionId: number; lsn: Lsn; timestamp: Date }
type OnDataProcessingResult =
  | {
      topLevelType: TopLevelType.PrimaryKeepaliveMessage
      messageType: MessageType.Other
      shouldPong: boolean
    }
  | {
      topLevelType: TopLevelType.XLogData
      messageType: MessageType.Begin
      transaction: Transaction
    }
  | {
      topLevelType: TopLevelType.XLogData
      messageType: MessageType.Insert
      transactionId: number
    }
  | {
      topLevelType: TopLevelType.XLogData
      messageType: MessageType.Other
      letter: string
    }

enum Bytes {
  Int8 = 1,
  Int16 = 2,
  Int32 = 4,
  Int64 = 8,
}

enum TopLevelType {
  XLogData = 'w',
  PrimaryKeepaliveMessage = 'k',
}

enum MessageType {
  Begin = 'B',
  Insert = 'I',
  Other = 'Other',
}

const TopLevelTypeValues = Object.values(TopLevelType)
const MessageTypeValues = Object.values(MessageType)

// https://www.postgresql.org/docs/16/protocol-replication.html#PROTOCOL-REPLICATION-XLOGDATA
/*
 * Byte1('w'). Identifies the message as WAL data.
 * Int64. The starting point of the WAL data in this message.
 * Int64. The current end of WAL on the server.
 * Int64. The server's system clock at the time of transmission.
 * ByteN. A section of the WAL data stream.
 */
const XLogData_WalRecordStartByteNumber = Bytes.Int8 + Bytes.Int64 + Bytes.Int64 + Bytes.Int64

const isTopLevelType = (char: string): char is TopLevelType => TopLevelTypeValues.includes(char as TopLevelType)
const parseTopLevelType = (char: string): TopLevelType => {
  if (!isTopLevelType(char)) {
    throw new Error(`INTERNAL_ERROR`)
  }

  return char
}
const parseMessageType = (char: string): MessageType => {
  if (MessageTypeValues.includes(char as MessageType)) {
    return char as MessageType
  }

  return MessageType.Other
}
const keepAliveResult = (shouldPong: boolean): OnDataProcessingResult => ({
  topLevelType: TopLevelType.PrimaryKeepaliveMessage,
  messageType: MessageType.Other,
  shouldPong,
})
const offset = (offset = 0) => ({
  add: (bytes: Bytes) => (offset += bytes),
  addInt8: () => (offset += Bytes.Int8),
  addInt16: () => (offset += Bytes.Int16),
  addInt32: () => (offset += Bytes.Int32),
  addInt64: () => (offset += Bytes.Int64),
  value: () => offset,
})

const startLogicalReplication = async (
  state: LogicalReplicationState,
  sql: Sql,
  publish: (event: Event) => AsyncOrSync<void> | never,
) => {
  // state = { ...state }

  const transactions = new Map<number, Transaction>()
  const location = typeof state.lastProcessedLsn === 'undefined' ? '0/19EF078' : state.lastProcessedLsn.toString()
  // const stream = await sql.unsafe(`
  //   START_REPLICATION SLOT ${state.slotName} LOGICAL ${location} (proto_version '1', publication_names '${state.publication}');
  // `)

  const stream = await sql
    .unsafe(`START_REPLICATION SLOT outbox_slot LOGICAL 0/19EF0B0 (proto_version '1', publication_names 'outbox_pub')`)
    .writable()

  const close = async () => {
    if (stream) {
      await new Promise((r) => (stream.once('close', r), stream.end()))
    }
    return sql.end()
  }

  const storeResult = (result: OnDataProcessingResult) => {
    if (result.messageType === MessageType.Begin) {
      transactions.set(result.transaction.transactionId, result.transaction)
    } else if (result.messageType === MessageType.Insert) {
      assert(transactions.has(result.transactionId))

      const transaction = transactions.get(result.transactionId)
      console.log(transaction)
      // publish
    }

    return result
  }

  const handleResult = (result: OnDataProcessingResult) => {
    if (result.topLevelType === TopLevelType.PrimaryKeepaliveMessage && result.shouldPong) {
      acknowledge()
    }
  }

  // Standby status update (F)
  // https://www.postgresql.org/docs/10/protocol-replication.html
  const acknowledge = () => {
    const pos = offset()
    const reply = Buffer.alloc(2 * Bytes.Int8 + 4 * Bytes.Int64)
    // Identifies the message as Standby status update.
    reply.write('r', pos.value())
    // Int64. The location of the last WAL byte + 1 received and written to disk in the standby.
    reply.fill(state.lastProcessedLsn, pos.addInt8())
    // Int64. The location of the last WAL byte + 1 flushed to disk in the standby.
    reply.fill(state.lastProcessedLsn, pos.addInt64())
    // Int64. The location of the last WAL byte + 1 applied in the standby.
    reply.fill(state.lastProcessedLsn, pos.addInt64())
    // Int64. The client's system clock at the time of transmission.
    reply.writeBigInt64BE(toServerSystemClock(Date.now()), pos.addInt64())
    // If 1, the client requests the server to reply to this message immediately.
    // This can be used to ping the server, to test if the connection is still healthy.
    reply.write('\x00', pos.addInt64())
    // Replying.
    stream.write(reply)
  }

  stream.on('data', (message: Buffer) => handleResult(storeResult(onData(message))))
  stream.on('error', onError)
  stream.on('close', () => {
    close().catch(noop)
  })
}

const onData = (message: Buffer): OnDataProcessingResult => {
  const topLevelType = parseTopLevelType(String.fromCharCode(message[0]))

  switch (topLevelType) {
    case TopLevelType.PrimaryKeepaliveMessage:
      return processPrimaryKeepAliveMessage(message)
    case TopLevelType.XLogData: {
      const data = message.subarray(XLogData_WalRecordStartByteNumber)
      const type = parseMessageType(String.fromCharCode(data[0]))

      switch (type) {
        case MessageType.Begin:
          return processBeginMessage(data)
        case MessageType.Insert:
          return processInsertMessage(data)
        default:
          return { topLevelType: TopLevelType.XLogData, messageType: MessageType.Other, letter: type }
      }
      // parse(x.subarray(25), state, sql.options.parsers, handle, options.transform)
    }
    default:
      assertNever(topLevelType)
  }
}

const onError = (error: Error) => {
  console.error(error)
}

const parse = (data: Buffer) => {
  // const char = (acc, [k, v]) => (acc[k.charCodeAt(0)] = v, acc)
}

// https://www.postgresql.org/docs/current/protocol-logicalrep-message-fordatamats.html#PROTOCOL-LOGICALREP-MESSAGE-FORMATS-INSERT
// https://www.postgresql.org/docs/current/protocol-logicalrep-message-formats.html#PROTOCOL-LOGICALREP-MESSAGE-FORMATS-TUPLEDATA
/*
 * Byte1('I'). Identifies the message as an insert message.
 * Int32 (TransactionId). Xid of the transaction (only present for streamed transactions).
 * Int32 (Oid). OID of the relation corresponding to the ID in the relation message.
 * Byte1('N'). Identifies the following TupleData message as a new tuple.
 * TupleData. TupleData message part representing the contents of new tuple.
 */
/*
TupleData 

Int16. Number of columns.

Next, one of the following submessages appears for each column (except generated columns):

Byte1('n'). Identifies the data as NULL value. 110.

Or

Byte1('u'). Identifies unchanged TOASTed value (the actual value is not sent). 117.

Or

Byte1('t'). Identifies the data as text formatted value. 116.

Or

Byte1('b'). Identifies the data as binary formatted value. 98.

Int32. Length of the column value.

ByteN. The value of the column, either in binary or in text format. (As specified in the preceding format byte). N is the above length.
*/
const processInsertMessage = (data: Buffer): OnDataProcessingResult => {
  const transactionId = data.readInt32BE(Bytes.Int8)
  const TUPLE_START_BYTE = Bytes.Int8 + Bytes.Int32 + Bytes.Int32 + Bytes.Int8
  const tuplesBuffer = data.subarray(TUPLE_START_BYTE)
  // const columnsCount = tuplesBuffer.readUInt32BE(Bytes.Int16)
  // const columnsDescriptions = tuplesBuffer.readUInt32BE(Bytes.Int8 * 3)

  // assert(columnsCount === 3)

  return {
    topLevelType: TopLevelType.XLogData,
    messageType: MessageType.Insert,
    transactionId,
  }
}

/*
 * Byte1('B'). Identifies the message as a begin message.
 * Int64 (XLogRecPtr). The final LSN of the transaction.
 * Int64 (TimestampTz). Commit timestamp of the transaction. The value is in number of microseconds since PostgreSQL epoch (2000-01-01).
 * Int32 (TransactionId). Xid of the transaction.
 */
const processBeginMessage = (data: Buffer): OnDataProcessingResult => {
  const pos = offset(Bytes.Int8)
  const lsn = data.subarray(pos.value(), pos.addInt64())
  const timestamp = toTimestamp(data.readBigInt64BE(pos.value()))
  const transactionId = data.readInt32BE(pos.addInt64())

  return {
    topLevelType: TopLevelType.XLogData,
    messageType: MessageType.Begin,
    transaction: { transactionId, lsn, timestamp },
  }
}

/*
 * Byte1('k'). Identifies the message as a sender keepalive.
 * Int64. The current end of WAL on the server.
 * Int64. The server's system clock at the time of transmission, as microseconds since midnight on 2000-01-01.
 * Byte1. 1 means that the client should reply to this message as soon as possible, to avoid a timeout disconnect. 0 otherwise.
 */
const processPrimaryKeepAliveMessage = (data: Buffer) => {
  if (!data[Bytes.Int8 + Bytes.Int64 + Bytes.Int64]) {
    return keepAliveResult(false)
  }

  return keepAliveResult(true)
}

const toTimestamp = (value: bigint) => new Date(Date.UTC(2000, 0, 1) + Number(value / 1000n))
const toServerSystemClock = (epochMs: number) => BigInt(epochMs - Date.UTC(2000, 0, 1)) * 1000n

// UINT MAX 0xffffffff
// Standby status update (F)
// https://www.postgresql.org/docs/10/protocol-replication.html
async function sendAcknowledgment(sql: Sql, lsn: string) {
  const slice = lsn.split('/')
  const [upperWAL, lowerWAL] = [parseInt(slice[0], 16), parseInt(slice[1], 16)]
  const feedbackMessage = Buffer.alloc(1 + 8 + 8 + 8 + 8 + 1)
  // Identifies the message as a receiver status update.
  feedbackMessage.write('r', 0)
  // Int64. The location of the last WAL byte + 1 received and written to disk in the standby.
  feedbackMessage.writeBigInt64BE(BigInt(lsn), 1)
  // Int64. The location of the last WAL byte + 1 flushed to disk in the standby.
  feedbackMessage.writeBigInt64BE(BigInt(lsn), 9)
  // Int64. The location of the last WAL byte + 1 applied in the standby.
  feedbackMessage.writeBigInt64BE(BigInt(lsn), 17)
  // Int64. The client's system clock at the time of transmission,
  // as microseconds since midnight on 2000-01-01.
  feedbackMessage.writeBigInt64BE(BigInt(Date.now() - new Date('2000-01-01T00:00:00Z').getTime()) * 1000n, 25)
  // If 1, the client requests the server to reply to this message immediately.
  // This can be used to ping the server, to test if the connection is still healthy.
  feedbackMessage.write('\x00', 33)

  await sql.unsafe(feedbackMessage.toString('binary'))
}

export { LogicalReplicationState, startLogicalReplication }
