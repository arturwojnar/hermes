import { clearInterval, setInterval } from 'node:timers'
import { ResendingStrategy } from './typings.js'

const createIntervalResendingStrategy =
  <InsertResult>(): ResendingStrategy<InsertResult> =>
  ({ getMessages, publishMessage, isPublishing, interval }) => {
    const _iteration = () => {
      // first failed and still not delivered.
      const failedMessage = getMessages().find((message) => !message.delivered && message.failed)

      if (failedMessage) {
        publishMessage(failedMessage)
      }

      // if for some reason, a queue is not publishing and there are still not delivered messages,
      // then pick up the first one and publish it.
      const notDeliveredMessage = getMessages().find((message) => !message.delivered && !message.failed)

      if (!isPublishing() && notDeliveredMessage) {
        console.log('~~!!!!!!!!!!!!!!!!!!!')
        publishMessage(notDeliveredMessage)
      }
    }

    const timer = setInterval(_iteration, interval.ms)

    return () => clearInterval(timer)
  }

export { createIntervalResendingStrategy }
