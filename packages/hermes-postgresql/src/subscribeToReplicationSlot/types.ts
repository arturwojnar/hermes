import { NonEmptyString } from '@arturwojnar/hermes'
import type { Lsn } from '../common/lsn.js'

enum MessageType {
  Begin = 'B',
  Insert = 'I',
  Commit = 'C',
  Other = 'Other',
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

type LogicalReplicationState = {
  lastProcessedLsn: Lsn
  timestamp: Date
  publication: string
  slotName: string
}

type ColumnType = 'bigint' | 'text' | 'jsonb' | 'uint'
type ColumnConfig<Keys extends string | number | symbol = string | number | symbol> = {
  [key in Keys]: ColumnType
}
type MessageId = NonEmptyString<'MessageId'>

type OnDataProcessingResult<InsertResult> =
  | {
      topLevelType: TopLevelType.PrimaryKeepaliveMessage
      messageType: MessageType.Other
      shouldPong: boolean
    }
  | {
      topLevelType: TopLevelType.XLogData
      messageType: MessageType.Begin
      transactionId: number
      lsn: Lsn
      timestamp: Date
    }
  | {
      topLevelType: TopLevelType.XLogData
      messageType: MessageType.Insert
      result: InsertResult
    }
  | {
      topLevelType: TopLevelType.XLogData
      messageType: MessageType.Commit
      commitLsn: Lsn
      transactionEndLsn: Lsn
      commitTimestamp: Date
    }
  | {
      topLevelType: TopLevelType.XLogData
      messageType: MessageType.Other
      symbol: string
    }

type Transaction<InsertResult = unknown> = {
  transactionId: number
  lsn: Lsn
  timestamp: Date
  results: InsertResult[]
}

// type OnCommit<InsertResult = unknown> = (transaction: Transaction<InsertResult>) => Promise<void>
type OnInsert<InsertResult = unknown> = (
  transaction: Transaction<InsertResult>,
  acknowledge: () => void,
) => Promise<void>

const TopLevelTypeValues = Object.values(TopLevelType)
const MessageTypeValues = Object.values(MessageType)
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

export {
  Bytes,
  LogicalReplicationState,
  MessageType,
  OnDataProcessingResult,
  parseMessageType,
  parseTopLevelType,
  TopLevelType,
  type ColumnConfig,
  type ColumnType,
  type MessageId,
  type OnInsert,
  type Transaction,
}
