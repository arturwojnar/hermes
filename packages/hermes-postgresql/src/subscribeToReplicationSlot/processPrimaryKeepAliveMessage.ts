import type { OnDataProcessingResult } from './types'
import { Bytes, MessageType, TopLevelType } from './types'

const keepAliveResult = (shouldPong: boolean): OnDataProcessingResult => ({
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
const processPrimaryKeepAliveMessage = (data: Buffer) => {
  if (!data[Bytes.Int8 + Bytes.Int64 + Bytes.Int64]) {
    return keepAliveResult(false)
  }

  return keepAliveResult(true)
}

export { processPrimaryKeepAliveMessage }
