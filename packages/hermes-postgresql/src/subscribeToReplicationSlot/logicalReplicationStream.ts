/* -eslint-disable  @typescript-eslint/no-unused-vars  */

import { noop } from '@arturwojnar/hermes'
import { pipe } from 'fp-ts/lib/function.js'
import type { Error } from 'postgres'
import type { Publish } from '../common/types.js'
import { HermesSql } from '../index.js'
import { onData } from './onData.js'
import { sendStandbyStatusUpdate } from './sendStandbyStatusUpdate.js'
import { commitTransaction as _commitTransaction } from './transaction/commitTransaction.js'
import { addInsert, createTransaction, emptyTransaction, Transaction } from './transaction/transaction.js'
import { MessageType, TopLevelType, type LogicalReplicationState, type OnDataProcessingResult } from './types.js'

export type LogicalReplicationParams = {
  state: LogicalReplicationState
  sql: HermesSql
  publish: Publish
  onCommit: (transaction: Transaction) => Promise<void>
}

const startLogicalReplication = async <Event>(params: LogicalReplicationParams) => {
  const { state, sql, publish, onCommit } = params
  let currentTransaction = emptyTransaction(state.lastProcessedLsn)
  const location = typeof state.lastProcessedLsn === 'undefined' ? '0/00000000' : state.lastProcessedLsn.toString()
  const stream = await sql
    .unsafe(
      `START_REPLICATION SLOT hermes_slot LOGICAL ${location} (proto_version '1', publication_names 'hermes_pub')`,
    )
    .writable()
  const acknowledgeLastLsn = sendStandbyStatusUpdate(stream, () => state.lastProcessedLsn)
  const acknowledge = sendStandbyStatusUpdate(stream, () => currentTransaction.lsn)
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
      acknowledgeLastLsn()
    } else if (result.topLevelType === TopLevelType.XLogData && result.messageType === MessageType.Commit) {
      await commitTransaction(currentTransaction)
      await onCommit(currentTransaction)

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
