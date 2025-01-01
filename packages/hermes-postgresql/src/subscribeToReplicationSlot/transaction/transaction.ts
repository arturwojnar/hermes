import { type Lsn } from '../../common/lsn.js'
import { Transaction } from '../types.js'

const emptyTransaction = <InsertResult = unknown>(lastProcessedLsn: Lsn): Transaction<InsertResult> => ({
  lsn: lastProcessedLsn,
  timestamp: new Date('1970-01-01T00:00:00Z'),
  results: [],
  transactionId: 0,
})

const addInsert = <InsertResult = unknown>(transaction: Transaction, insert: InsertResult) => {
  transaction.results = [...transaction.results, insert]
}

const createTransaction = <InsertResult>(
  transactionId: number,
  lsn: Lsn,
  timestamp: Date,
): Transaction<InsertResult> => {
  return { transactionId, lsn, timestamp, results: [] }
}

export { addInsert, createTransaction, emptyTransaction, type Transaction }
