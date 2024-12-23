import type { Lsn } from '../common/lsn.js'
import { type InsertResult } from './transaction/transaction.js'

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

type OnDataProcessingResult =
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
      transactionId: number
      result: InsertResult
    }
  | {
      topLevelType: TopLevelType.XLogData
      messageType: MessageType.Commit
      commitTimestamp: Date
    }
  | {
      topLevelType: TopLevelType.XLogData
      messageType: MessageType.Other
      symbol: string
    }

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
}
