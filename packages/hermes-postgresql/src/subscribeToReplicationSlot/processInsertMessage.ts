import assert from 'assert'
import type { Offset } from '../common/offset'
import { offset } from '../common/offset'
import type { OnDataProcessingResult } from './types'
import { Bytes, MessageType, TopLevelType } from './types'

const readIntFn = {
  '1': 'readUInt8' as const,
  '2': 'readUInt16BE' as const,
  '4': 'readUInt32BE' as const,
  '8': 'readBigUInt64BE' as const,
}
const readUInt = (buffer: Buffer, pos: Offset) => {
  const columnType = String.fromCharCode(buffer.readInt8(pos.value()))
  const columnLength = buffer.readInt32BE(pos.addInt8()).toString() as '1' | '2' | '4' | '8'

  assert(columnType === 't', 'readUInt.columnType')
  assert(['1', '2', '4', '8'].includes(columnLength), 'readUInt.columnLength')

  const value = buffer[readIntFn[columnLength]](pos.addInt32())

  pos.add(Number(columnLength))

  return value
}

const readText = (buffer: Buffer, pos: Offset) => {
  const columnType = String.fromCharCode(buffer.readInt8(pos.value()))
  const columnLength = buffer.readInt32BE(pos.addInt8())

  assert(columnType === 't', 'readText.columnType')

  const value = buffer.subarray(pos.addInt32(), pos.add(columnLength))

  return value.toString('utf-8')
}

const readJsonb = (buffer: Buffer, pos: Offset) => {
  const columnType = String.fromCharCode(buffer.readInt8(pos.value()))
  const columnLength = buffer.readInt32BE(pos.addInt8())

  assert(columnType === 't', 'readText.readJsonb')

  const value = buffer.subarray(pos.addInt32(), pos.add(columnLength))

  return value.toString('utf-8')
}

// https://www.postgresql.org/docs/current/protocol-logicalrep-message-fordatamats.html#PROTOCOL-LOGICALREP-MESSAGE-FORMATS-INSERT
// https://www.postgresql.org/docs/current/protocol-logicalrep-message-formats.html#PROTOCOL-LOGICALREP-MESSAGE-FORMATS-TUPLEDATA
/*
 * Byte1('I'). Identifies the message as an insert message.
 * Int32 (TransactionId). Xid of the transaction (only present for streamed transactions).
 * Int32 (Oid). OID of the relation corresponding to the ID in the relation message.
 * Byte1('N'). Identifies the following TupleData message as a new tuple.
 * TupleData. TupleData message part representing the contents of new tuple.

-----------------

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
  const messageId = String.fromCharCode(data.readInt8(0))
  // const transactionId = data.readInt32BE(Bytes.Int8)
  const relationId = data.readInt32BE(Bytes.Int8)
  const newMessageId = String.fromCharCode(data.readInt8(Bytes.Int8 + Bytes.Int32))
  const TUPLE_START_BYTE = Bytes.Int8 + Bytes.Int32 + Bytes.Int8
  const tuplesBuffer = data.subarray(TUPLE_START_BYTE)
  const columnsCount = tuplesBuffer.readInt16BE(0)

  const pos = offset(Bytes.Int16)
  const position = readUInt(tuplesBuffer, pos)
  const eventType = readText(tuplesBuffer, pos)
  const payload = readJsonb(tuplesBuffer, pos)

  console.log(position)
  console.log(eventType)
  console.log(payload)
  // const columnsDescriptions = tuplesBuffer.readUInt32BE(Bytes.Int8 * 3)

  // assert(columnsCount === 3)
  const columns = {
    position: 1,
  }

  return {
    topLevelType: TopLevelType.XLogData,
    messageType: MessageType.Insert,
    transactionId: 0,
    result: {
      position,
      eventType,
      payload,
    },
  }
}

export { processInsertMessage }
