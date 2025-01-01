import type { OnDataProcessingResult } from './types.js'
import { Bytes, MessageType, TopLevelType } from './types.js'

const keepAliveResult = <InsertResult>(shouldPong: boolean): OnDataProcessingResult<InsertResult> => ({
  topLevelType: TopLevelType.PrimaryKeepaliveMessage,
  messageType: MessageType.Other,
  shouldPong,
})

/*
 * Byte1('k'). Identifies the message as a sender keepalive.
 * Int64. The current end of WAL on the server.
 * Int64. The server's system clock at the time of transmission, as microseconds since midnight on 2000-01-01.
 * Byte1. 1 means that the client should reply to this message as soon as possible, to avoid a timeout disconnect. 0 otherwise.
 */
const processPrimaryKeepAliveMessage = <InsertResult>(data: Buffer): OnDataProcessingResult<InsertResult> => {
  if (!data[Bytes.Int8 + Bytes.Int64 + Bytes.Int64]) {
    return keepAliveResult(false)
  }

  return keepAliveResult<InsertResult>(true)
}

export { processPrimaryKeepAliveMessage }
