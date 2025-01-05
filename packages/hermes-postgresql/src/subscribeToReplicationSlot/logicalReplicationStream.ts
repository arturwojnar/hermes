/* -eslint-disable  @typescript-eslint/no-unused-vars  */

import { noop } from '@arturwojnar/hermes'
import { pipe } from 'fp-ts/lib/function.js'
import type { Error } from 'postgres'
import { convertBigIntToLsn, incrementWAL } from '../common/lsn.js'
import { HermesSql } from '../common/types.js'
import { onData as _onData } from './onData.js'
import { sendStandbyStatusUpdate } from './sendStandbyStatusUpdate.js'
import { addInsert, createTransaction, emptyTransaction } from './transaction/transaction.js'
import {
  ColumnConfig,
  MessageType,
  OnInsert,
  TopLevelType,
  type LogicalReplicationState,
  type OnDataProcessingResult,
} from './types.js'

export type LogicalReplicationParams<InsertResult> = {
  state: LogicalReplicationState
  sql: HermesSql
  columnConfig: ColumnConfig<keyof InsertResult>
  onInsert: OnInsert<InsertResult>
}

const startLogicalReplication = async <InsertResult>(params: LogicalReplicationParams<InsertResult>) => {
  const { state, sql } = params
  const onInsert = params.onInsert || noop
  const location = typeof state.lastProcessedLsn === 'undefined' ? '0/00000000' : state.lastProcessedLsn
  let currentTransaction = emptyTransaction<InsertResult>(location)
  const stream = await sql
    .unsafe(
      `START_REPLICATION SLOT hermes_slot LOGICAL ${convertBigIntToLsn(incrementWAL(location))} (proto_version '1', publication_names '${params.state.publication}')`,
    )
    .writable()
  const curriedOnData = _onData(params.columnConfig)
  const onData = (message: Buffer) => curriedOnData(message)
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
      console.info(`[store] BEGIN ${result.transactionId} / ${result.lsn}`)
      currentTransaction = createTransaction<InsertResult>(result.transactionId, result.lsn, result.timestamp)
    } else if (result.messageType === MessageType.Insert) {
      // currentTransaction.results = [...currentTransaction.results, result.result]
      console.info(`[store] INSERT ${JSON.stringify(result.result)}`)
      addInsert(currentTransaction, result.result)
    } else if (result.messageType === MessageType.Commit) {
      console.info(`[store] COMMIT ${result.commitLsn}`)
      // currentTransaction.lsn = result.transactionEndLsn
      // console.log('storeResult - Commit')
    }

    return result
  }

  const handleResult = (result: OnDataProcessingResult<InsertResult>) => {
    if (result.topLevelType === TopLevelType.PrimaryKeepaliveMessage && result.shouldPong) {
      acknowledgeLastLsn()
    } else if (result.topLevelType === TopLevelType.XLogData && result.messageType === MessageType.Commit) {
      const commitLsn = currentTransaction.lsn
      const acknowledge = sendStandbyStatusUpdate(stream, () => commitLsn)

      onInsert(currentTransaction, acknowledge)

      // commitTransaction()

      state.lastProcessedLsn = currentTransaction.lsn
      currentTransaction = emptyTransaction(state.lastProcessedLsn)
    }
  }

  stream.on('data', (message: Buffer) => {
    pipe(message, onData, storeResult, handleResult)
  })
  stream.on('error', (error: Error) => {
    console.error(error)
  })
  stream.on('close', () => {
    close().catch(noop)
  })
}

const onError = (error: Error) => {
  console.error(error)
}

export { LogicalReplicationState, startLogicalReplication }
