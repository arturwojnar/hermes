import { ClientSession, ObjectId } from 'mongodb'
import { setTimeout } from 'node:timers/promises'
import { noop } from 'ts-essentials'
import { OutboxMessagesCollectionName } from './consts'
import { createChangeStream } from './createChangeStream'
import { ensureIndexes } from './ensureIndexes'
import { getConsumer } from './getConsumer'
import { ConsumerCreationParams, OutboxMessage } from './typings'
import { swallow } from './utils'

export const OutboxConsumer = <Event>(params: ConsumerCreationParams<Event>) => {
  const { db, partitionKey, publishEvent: _publishEvent } = params
  const waitAfterFailedPublishMs = params.waitAfterFailedPublishMs || 1000
  const onError = params.onError || noop
  const messages = db.collection<OutboxMessage<Event>>(OutboxMessagesCollectionName)

  return {
    async start() {
      await ensureIndexes(db)

      const consumer = await getConsumer(db, partitionKey)
      const watchCursor = createChangeStream<Event>(messages, partitionKey, consumer.resumeToken)
      const _waitUntilEventIsSent = async (event: Event) => {
        while (!watchCursor.closed) {
          try {
            await _publishEvent(event)
            break
          } catch (error) {
            // TODO
            await setTimeout(waitAfterFailedPublishMs)
            continue
          }
        }
      }
      const watch = async () => {
        while (!watchCursor.closed) {
          if (await watchCursor.hasNext()) {
            const { _id: resumeToken, operationType, fullDocument: message, documentKey } = await watchCursor.next()

            if (operationType !== 'insert') {
              continue
            }

            await _waitUntilEventIsSent(message.data)
            await consumer.update(documentKey._id, resumeToken)
          }
        }
      }

      watch()
        .catch(onError)
        .finally(() => swallow(() => watchCursor.close()))

      return async function stop() {
        if (!watchCursor.closed) {
          await watchCursor.close()
        }
      }
    },

    async publishEvent(event: Event, session: ClientSession) {
      await messages.insertOne(
        {
          _id: new ObjectId(),
          partitionKey,
          occurredAt: new Date(), // TODO
          data: event,
          // type: 'rrr',
        },
        { session },
      )
    },
  }
}
