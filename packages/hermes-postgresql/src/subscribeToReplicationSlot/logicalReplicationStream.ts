/* -eslint-disable  @typescript-eslint/no-unused-vars  */

import { noop } from '@arturwojnar/hermes'
import { pipe } from 'fp-ts/lib/function.js'
import type { Error } from 'postgres'
import { incrementWAL } from '../common/lsn.js'
import { HermesSql } from '../index.js'
import { onData as _onData } from './onData.js'
import { sendStandbyStatusUpdate } from './sendStandbyStatusUpdate.js'
import { addInsert, createTransaction, emptyTransaction } from './transaction/transaction.js'
import {
  ColumnConfig,
  MessageType,
  OnInserted,
  TopLevelType,
  type LogicalReplicationState,
  type OnDataProcessingResult,
} from './types.js'

export type LogicalReplicationParams<InsertResult> = {
  state: LogicalReplicationState
  sql: HermesSql
  columnConfig: ColumnConfig<keyof InsertResult>
  onInserted: OnInserted<InsertResult>
}

const startLogicalReplication = async <InsertResult>(params: LogicalReplicationParams<InsertResult>) => {
  const { state, sql } = params
  const onInserted = params.onInserted || noop
  const location = typeof state.lastProcessedLsn === 'undefined' ? '0/00000000' : state.lastProcessedLsn
  let currentTransaction = emptyTransaction<InsertResult>(location)
  const stream = await sql
    .unsafe(
      `START_REPLICATION SLOT hermes_slot LOGICAL ${incrementWAL(location)} (proto_version '1', publication_names '${params.state.publication}')`,
    )
    .writable()
  const onData = (message: Buffer) => _onData(params.columnConfig, message)
  const acknowledgeLastLsn = sendStandbyStatusUpdate(stream, () => state.lastProcessedLsn)
  const commitTransaction = sendStandbyStatusUpdate(stream, () => currentTransaction.lsn)
  const close = async () => {
    if (stream) {
      await new Promise((r) => (stream.once('close', r), stream.end()))
    }
    return sql.end()
  }

  const storeResult = (result: OnDataProcessingResult<InsertResult>) => {
    if (result.messageType === MessageType.Begin) {
      currentTransaction = createTransaction<InsertResult>(result.transactionId, result.lsn, result.timestamp)
      console.log(result)
    } else if (result.messageType === MessageType.Insert) {
      console.log(result)
      // currentTransaction.results = [...currentTransaction.results, result.result]
      addInsert(currentTransaction, result.result)
    } else if (result.messageType === MessageType.Commit) {
      // currentTransaction.lsn = result.transactionEndLsn
      console.log('storeResult - Commit')
    }

    return result
  }

  const handleResult = async (result: OnDataProcessingResult<InsertResult>) => {
    if (result.topLevelType === TopLevelType.PrimaryKeepaliveMessage && result.shouldPong) {
      acknowledgeLastLsn()
    } else if (result.topLevelType === TopLevelType.XLogData && result.messageType === MessageType.Commit) {
      await onInserted(currentTransaction)

      commitTransaction()

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
