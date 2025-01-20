import { assertNever, Duration } from '@arturwojnar/hermes'
import { setTimeout } from 'node:timers/promises'
import { Lsn } from '../common/lsn.js'
import { Transaction } from '../subscribeToReplicationSlot/types.js'

type MessageToPublish<InsertResult> = {
  transaction: Transaction<InsertResult>
  acknowledge: () => void
}

type PublishingQueueOptions<InsertResult> = {
  waitAfterFailedPublish?: Duration
  onFailedPublish?: (tx: Transaction<InsertResult>) => Promise<void>
}

type PublishResult = 'published' | 'failed' | 'exhausted'

const createPublishingQueue = <InsertResult>(
  publish: (messageToPublish: MessageToPublish<InsertResult>) => Promise<void>,
  options?: PublishingQueueOptions<InsertResult>,
) => {
  const waitAfterFailedPublish = options?.waitAfterFailedPublish || Duration.ofSeconds(1)
  const onFailedPublish = options?.onFailedPublish || (() => Promise.resolve())
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

  const publishOldestMessage = async (): Promise<PublishResult> => {
    if (messages.length === 0) {
      return 'exhausted'
    }

    const oldest = messages[0]

    try {
      await publish(oldest)
      unqueueOldest()
      console.info(`Published ${oldest.transaction.lsn}`)
      return 'published'
    } catch (error) {
      return 'failed'
    }
  }

  const publishMessages = async () => {
    if (isPublishing) {
      return
    }

    isPublishing = true

    try {
      do {
        const result = await publishOldestMessage()

        switch (result) {
          case 'published':
            continue
          case 'failed':
            await onFailedPublish(messages[0].transaction)

            if (waitAfterFailedPublish) {
              await setTimeout(waitAfterFailedPublish.ms)
            }

            break
          case 'exhausted':
            isPublishing = false
            break
          default:
            assertNever(result)
        }
      } while (isPublishing)
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
