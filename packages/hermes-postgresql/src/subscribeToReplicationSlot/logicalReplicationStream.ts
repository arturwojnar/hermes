/* -eslint-disable  @typescript-eslint/no-unused-vars  */

import { Duration, noop, swallow } from '@arturwojnar/hermes'
import { pipe } from 'fp-ts/lib/function.js'
import { setTimeout } from 'node:timers/promises'
import postgres from 'postgres'
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

const PSQL_ADMIN_SHUTDOWN = '57P01'

const startLogicalReplication = async <InsertResult>(params: LogicalReplicationParams<InsertResult>) => {
  const { state, sql } = params
  const onInsert = params.onInsert || noop
  const location = typeof state.lastProcessedLsn === 'undefined' ? '0/00000000' : state.lastProcessedLsn
  let currentTransaction = emptyTransaction<InsertResult>(location)
  const stream = await sql
    .unsafe(
      `START_REPLICATION SLOT ${state.slotName} LOGICAL ${convertBigIntToLsn(incrementWAL(location))} (proto_version '1', publication_names '${params.state.publication}')`,
    )
    .writable()
  const curriedOnData = _onData(params.columnConfig)
  const onData = (message: Buffer) => curriedOnData(message)
  const acknowledgeLastLsn = sendStandbyStatusUpdate(stream, () => state.lastProcessedLsn)
  const close = async () => {
    const timeout = Duration.ofSeconds(1).ms

    await Promise.all([Promise.race([swallow(() => sql.end({ timeout })), setTimeout(timeout)])])
  }

  const storeResult = (result: OnDataProcessingResult<InsertResult>) => {
    if (result.messageType === MessageType.Begin) {
      currentTransaction = createTransaction<InsertResult>(result.transactionId, result.lsn, result.timestamp)
    } else if (result.messageType === MessageType.Insert) {
      addInsert(currentTransaction, result.result)
    } else if (result.messageType === MessageType.Commit) {
      // console.info(`[store] COMMIT ${result.commitLsn}`)
    }

    return result
  }

  const handleResult = (result: OnDataProcessingResult<InsertResult>) => {
    if (result.topLevelType === TopLevelType.PrimaryKeepaliveMessage && result.shouldPong) {
      acknowledgeLastLsn()
    } else if (result.topLevelType === TopLevelType.XLogData && result.messageType === MessageType.Commit) {
      const acknowledge = () => {
        sendStandbyStatusUpdate(stream, () => params.state.lastProcessedLsn)
        state.lastProcessedLsn = currentTransaction.lsn
        currentTransaction = emptyTransaction(state.lastProcessedLsn)
      }

      onInsert(currentTransaction, acknowledge)
    }
  }

  stream.on('data', (message: Buffer) => {
    pipe(message, onData, storeResult, handleResult)
  })

  stream.on('error', async (error) => {
    const pError = error as postgres.PostgresError

    if (
      (pError.code === PSQL_ADMIN_SHUTDOWN || pError.code === 'CONNECTION_CLOSED') &&
      pError.query.includes('START_REPLICATION SLOT')
    ) {
      console.info('Replication connection closed due to database shutdown')
      await swallow(() => sql.end({ timeout: Duration.ofSeconds(1).ms }))
    } else {
      console.error(error, 'startLogicalReplication')
    }
  })

  stream.on('close', () => {
    close().catch(noop)
  })
}

export { LogicalReplicationState, startLogicalReplication }
