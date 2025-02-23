import { assertNever, CancellationPromise, Duration } from '@arturwojnar/hermes'
import { setTimeout } from 'node:timers/promises'
import { Lsn } from '../common/lsn.js'
import { Transaction } from '../subscribeToReplicationSlot/types.js'
import { MessageToPublish } from './createNonBlockingPublishingQueue.js'
import { PublishingQueue } from './publishingQueue.js'

type PublishingQueueOptions<InsertResult> = {
  waitAfterFailedPublish?: Duration
  onFailedPublish?: (tx: Transaction<InsertResult>) => Promise<void>
}

type PublishResult = 'published' | 'failed' | 'exhausted'

const createSerializedPublishingQueue = <InsertResult>(
  publish: (messageToPublish: MessageToPublish<InsertResult>) => Promise<void>,
  options?: PublishingQueueOptions<InsertResult>,
): PublishingQueue<'SerializedPublishingQueue', InsertResult> => {
  const waitAfterFailedPublish = options?.waitAfterFailedPublish || Duration.ofSeconds(1)
  const onFailedPublish = options?.onFailedPublish || (() => Promise.resolve())
  const ids = new Set<Lsn>()
  // LIFO
  const messages = new Array<MessageToPublish<InsertResult>>()
  let isPublishing = false
  let publishingPromise = CancellationPromise.resolved()

  const queue = (messageToPublish: MessageToPublish<InsertResult>) => {
    if (ids.has(messageToPublish.transaction.lsn)) {
      return messageToPublish
    }

    ids.add(messageToPublish.transaction.lsn)
    messages.push(messageToPublish)

    return messageToPublish
  }

  const dequeueOldest = () => {
    if (messages.length === 0) {
      return
    }

    const oldest = messages.shift()!
    ids.delete(oldest.transaction.lsn)
  }

  const run = async () => {
    if (isPublishing) {
      return
    }

    isPublishing = true
    publishingPromise = new CancellationPromise()

    try {
      do {
        const result = await _publishOldestMessage()

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
            publishingPromise.resolve()
            break
          default:
            assertNever(result)
        }
      } while (isPublishing)
    } finally {
      isPublishing = false
      publishingPromise.resolve()
    }
  }

  const _publishOldestMessage = async (): Promise<PublishResult> => {
    if (messages.length === 0) {
      return 'exhausted'
    }

    const oldest = messages[0]

    try {
      await publish(oldest)
      dequeueOldest()
      await oldest.acknowledge()

      return 'published'
    } catch (error) {
      if (messages.length && messages[0].transaction.lsn !== oldest.transaction.lsn) {
        // the message has been dequeued.
        ids.add(oldest.transaction.lsn)
        messages.unshift(oldest)
      }
      return 'failed'
    }
  }

  return {
    name: () => 'SerializedPublishingQueue',
    queue,
    run,
    size: () => messages.length,
    waitUntilIsEmpty: () => publishingPromise,
  }
}

export { createSerializedPublishingQueue, type MessageToPublish }
