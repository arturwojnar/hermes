import type { Transaction } from './transaction.js'

const commitTransaction = async <InsertResult>(transaction: Transaction<InsertResult>) => {
  try {
    // Process all inserts in the transaction
    for (const result of transaction.results) {
      try {
        // await publish({
        //   position: result.position,
        //   messageType: result.messageType,
        //   lsn: transaction.lsn,
        //   event: JSON.parse(result.payload),
        // })
        // await Promise.race([
        //   this.publish(JSON.parse(result.payload)),
        //   async () => {
        //     await setTimeout(this.processingTimeout.ms)
        //     new Error('Publishing timeout')
        //   },
        // ])
      } catch (error) {
        console.log('IO')
        throw error
      }
    }
  } catch (error) {
    console.log('IO')
    // Let caller handle the retry strategy
    throw error
  }
}

export { commitTransaction }
