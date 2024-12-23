import { assertNever } from '@arturwojnar/hermes'
import { XLogData_WalRecordStartByteNumber } from './consts'
import { processBeginMessage } from './processBeginMessage'
import { processCommitMessage } from './processCommitMessage'
import { processInsertMessage } from './processInsertMessage'
import { processPrimaryKeepAliveMessage } from './processPrimaryKeepAliveMessage'
import type { OnDataProcessingResult } from './types'
import { MessageType, parseMessageType, parseTopLevelType, TopLevelType } from './types'

const onData = (message: Buffer): OnDataProcessingResult => {
  const topLevelType = parseTopLevelType(String.fromCharCode(message[0]))

  switch (topLevelType) {
    case TopLevelType.PrimaryKeepaliveMessage:
      return processPrimaryKeepAliveMessage(message)
    case TopLevelType.XLogData: {
      const data = message.subarray(XLogData_WalRecordStartByteNumber)
      const symbol = String.fromCharCode(data[0])
      const type = parseMessageType(symbol)

      switch (type) {
        case MessageType.Begin:
          return processBeginMessage(data)
        case MessageType.Insert:
          return processInsertMessage(data)
        case MessageType.Commit:
          return processCommitMessage(data)
        default:
          return { topLevelType: TopLevelType.XLogData, messageType: MessageType.Other, symbol }
      }
      // parse(x.subarray(25), state, sql.options.parsers, handle, options.transform)
    }
    default:
      assertNever(topLevelType)
  }
}

export { onData }
