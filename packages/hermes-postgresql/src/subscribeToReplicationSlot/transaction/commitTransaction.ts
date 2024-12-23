import type { Publish } from '../../common/types'
import type { Transaction } from './transaction'

const commitTransaction = async (publish: Publish, transaction: Transaction) => {
  try {
    // Process all inserts in the transaction
    for (const result of transaction.results) {
      try {
        await publish({
          position: result.position,
          eventType: result.eventType,
          lsn: transaction.lsn,
          event: JSON.parse(result.payload),
        })
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
