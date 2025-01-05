import { Lsn } from '../common/lsn.js'
import { Transaction } from '../subscribeToReplicationSlot/types.js'

type MessageToPublish<InsertResult> = {
  transaction: Transaction<InsertResult>
  acknowledge: () => void
}

const createPublishingQueue = <InsertResult>(
  publish: (messageToPublish: MessageToPublish<InsertResult>) => Promise<void>,
) => {
  const ids = new Set<Lsn>()
  // LIFO
  const messages = new Array<MessageToPublish<InsertResult>>()
  let isPublishing = false

  const queue = (messageToPublish: MessageToPublish<InsertResult>) => {
    if (ids.has(messageToPublish.transaction.lsn)) {
      return
    }

    ids.add(messageToPublish.transaction.lsn)
    messages.push(messageToPublish)
  }

  const unqueueOldest = () => {
    if (messages.length === 0) {
      return
    }

    const oldest = messages.shift()!
    ids.delete(oldest.transaction.lsn)
  }

  const publishOldestMessage = async () => {
    if (messages.length === 0) {
      return false
    }

    const oldest = messages[0]

    try {
      await publish(oldest)
      oldest.acknowledge()
      unqueueOldest()
      console.info(`Published ${oldest.transaction.lsn}`)
      return true
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  const publishMessages = async () => {
    if (isPublishing) {
      return
    }

    isPublishing = true

    try {
      while (await publishOldestMessage()) {
        console.log(`A message published successfully.`)
      }
    } finally {
      isPublishing = false
    }
  }

  const size = () => messages.length

  return {
    queue,
    publishMessages,
    size,
  }
}

export { createPublishingQueue, type MessageToPublish }
