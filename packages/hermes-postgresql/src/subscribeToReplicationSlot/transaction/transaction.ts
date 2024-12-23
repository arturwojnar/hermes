import type { Lsn } from '../../common/lsn.js'

type InsertResult = {
  position: number | bigint
  eventType: string
  payload: string
}
type Transaction = { transactionId: number; lsn: Lsn; timestamp: Date; results: InsertResult[] }

const emptyTransaction = (lastProcessedLsn: Lsn): Transaction => ({
  lsn: lastProcessedLsn,
  timestamp: new Date('1970-01-01T00:00:00Z'),
  results: [],
  transactionId: 0,
})

const addInsert = (transaction: Transaction, insert: InsertResult) => {
  transaction.results = [...transaction.results, insert]
}

const createTransaction = (transactionId: number, lsn: Lsn, timestamp: Date): Transaction => {
  return { transactionId, lsn, timestamp, results: [] }
}

export { addInsert, createTransaction, emptyTransaction, type InsertResult, type Transaction }
