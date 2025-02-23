import { CancellationPromise } from '@arturwojnar/hermes'
import { createAsyncOpsQueue } from '../common/createAsyncOpsQueue.js'
import { Lsn } from '../common/lsn.js'
import { MessageToPublish, PublishingQueue, PublishingQueueOptions } from './publishingQueue.js'

type StateMessage<InsertResult> = MessageToPublish<InsertResult> & { delivered: boolean }

const createNonBlockingPublishingQueue = <InsertResult>(
  publish: (messageToPublish: MessageToPublish<InsertResult>) => Promise<void>,
  options?: PublishingQueueOptions<InsertResult>,
): PublishingQueue<'NonBlockingPublishingQueue', InsertResult> => {
  const onFailedPublish = options?.onFailedPublish || (() => Promise.resolve())
  const ids = new Set<Lsn>()
  const acknowledgmentQueue = createAsyncOpsQueue()
  // LIFO
  const messages = new Array<StateMessage<InsertResult>>()
  let publishingPromise = CancellationPromise.resolved()

  const getNextTransactionLsnThatShouldBeDelivered = () => {
    return messages?.[0]?.transaction?.lsn
  }

  const queue = (messageToPublish: MessageToPublish<InsertResult>) => {
    if (ids.has(messageToPublish.transaction.lsn)) {
      return messageToPublish
    }

    ids.add(messageToPublish.transaction.lsn)
    messages.push({ ...messageToPublish, delivered: false })

    return messageToPublish
  }

  const run = async (messageToPublish?: MessageToPublish<InsertResult>) => {
    if (messages.length > 0 && !publishingPromise.isPending) {
      publishingPromise = new CancellationPromise()
    }

    // If the message to publish is not given, then we take the oldest message.
    // The `messageToPublish` can be different than the oldest message because
    // it can be that the oldest message has not yet been delivered (and thus has not been dequeued).
    // Also, in the scenario when one of the younger messages is tried to be delivered another time,
    // after a failed previous attempt.
    messageToPublish = messageToPublish || messages[0]

    await _publishMessage(messageToPublish)
  }

  const _removeMessage = (message: MessageToPublish<InsertResult>) => {
    if (messages.length === 0) {
      return
    }

    const index = messages.findIndex(({ transaction }) => transaction.lsn === message.transaction.lsn)

    if (index !== -1) {
      messages.splice(index, 1)
      ids.delete(message.transaction.lsn)
    }
  }

  const _getFirstMessagedThatIsDeliveredButNotAcked = () => {
    return messages?.[0]?.delivered ? messages[0] : undefined
  }

  const _publishMessage = async (message: MessageToPublish<InsertResult>) => {
    try {
      await publish(message)

      // check if delivered message, is the next following transaction
      // to not skip any message.
      if (message.transaction.lsn === getNextTransactionLsnThatShouldBeDelivered()) {
        await acknowledgmentQueue.waitFor(acknowledgmentQueue.queue(() => message.acknowledge()))
        _removeMessage(message)

        // check whether in the meantime newer messages have been delivered.
        let messageToAck: StateMessage<InsertResult> | undefined
        while ((messageToAck = _getFirstMessagedThatIsDeliveredButNotAcked())) {
          const message = messageToAck
          await acknowledgmentQueue.waitFor(acknowledgmentQueue.queue(() => message.acknowledge()))
          _removeMessage(message)
        }

        if (messages.length === 0) {
          publishingPromise.resolve()
        }
      } else {
        const index = messages.findIndex(({ transaction }) => transaction.lsn === message.transaction.lsn)

        if (index >= 0 && !messages[index].delivered) {
          messages[index].delivered = true
        }
      }

      return 'published'
    } catch (error) {
      await onFailedPublish(message.transaction)
    }
  }

  return {
    name: () => 'NonBlockingPublishingQueue',
    queue,
    run,
    size: () => messages.length,
    waitUntilIsEmpty: () => publishingPromise,
  }
}

export { createNonBlockingPublishingQueue, type MessageToPublish }
