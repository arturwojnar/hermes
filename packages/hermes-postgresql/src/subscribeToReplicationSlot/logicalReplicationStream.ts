/* -eslint-disable  @typescript-eslint/no-unused-vars  */

import { noop } from '@arturwojnar/hermes'
import { pipe } from 'fp-ts/lib/function.js'
import type { Error, Sql } from 'postgres'
import type { Publish } from '../common/types.js'
import { onData } from './onData.js'
import { sendStandbyStatusUpdate } from './sendStandbyStatusUpdate.js'
import { commitTransaction as _commitTransaction } from './transaction/commitTransaction.js'
import { addInsert, createTransaction, emptyTransaction } from './transaction/transaction.js'
import { MessageType, TopLevelType, type LogicalReplicationState, type OnDataProcessingResult } from './types.js'

const startLogicalReplication = async <Event>(state: LogicalReplicationState, sql: Sql, publish: Publish) => {
  let currentTransaction = emptyTransaction(state.lastProcessedLsn)
  const location = typeof state.lastProcessedLsn === 'undefined' ? '0/00000000' : state.lastProcessedLsn.toString()
  const stream = await sql
    .unsafe(
      `START_REPLICATION SLOT outbox_slot LOGICAL ${location} (proto_version '1', publication_names 'outbox_pub')`,
    )
    .writable()
  const acknowledge = sendStandbyStatusUpdate(stream, () => state.lastProcessedLsn)
  const commitTransaction = _commitTransaction.bind(undefined, publish)
  const close = async () => {
    if (stream) {
      await new Promise((r) => (stream.once('close', r), stream.end()))
    }
    return sql.end()
  }
  // position 50
  const storeResult = (result: OnDataProcessingResult) => {
    if (result.messageType === MessageType.Begin) {
      currentTransaction = createTransaction(result.transactionId, result.lsn, result.timestamp)
      console.log(result)
    } else if (result.messageType === MessageType.Insert) {
      console.log(result)
      // currentTransaction.results = [...currentTransaction.results, result.result]
      addInsert(currentTransaction, result.result)
    } else if (result.messageType === MessageType.Commit) {
      console.log(result)
    }

    return result
  }

  const handleResult = async (result: OnDataProcessingResult) => {
    if (result.topLevelType === TopLevelType.PrimaryKeepaliveMessage && result.shouldPong) {
      acknowledge()
    } else if (result.topLevelType === TopLevelType.XLogData && result.messageType === MessageType.Commit) {
      await commitTransaction(currentTransaction)
      acknowledge()
      state.lastProcessedLsn = currentTransaction.lsn
      currentTransaction = emptyTransaction(state.lastProcessedLsn)
    }
  }

  stream.on('data', async (message: Buffer) => {
    await pipe(message, onData, storeResult, handleResult)
    // await handleResult(storeResult(onData(message)))
  })
  stream.on('error', onError)
  stream.on('close', () => {
    close().catch(noop)
  })
}

const onError = (error: Error) => {
  console.error(error)
}

export { LogicalReplicationState, startLogicalReplication }
