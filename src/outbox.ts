import { ClientSession, Db, MongoClient, ObjectId } from 'mongodb'
import { setTimeout } from 'node:timers/promises'
import { noop } from 'ts-essentials'
import { addDisposeOnSigterm } from './addDisposeOnSigterm'
import { OutboxMessagesCollectionName } from './consts'
import { createChangeStream } from './createChangeStream'
import { ensureIndexes } from './ensureIndexes'
import { getConsumer } from './getConsumer'
import { ConsumerCreationParams, OutboxMessage } from './typings'
import { isNil, swallow } from './utils'

export const OutboxConsumer = <Event>(params: ConsumerCreationParams<Event>) => {
  const { client, db, publishEvent: _publishEvent } = params
  const partitionKey = params.partitionKey || 'default'
  const waitAfterFailedPublishMs = params.waitAfterFailedPublishMs || 1000
  const shouldDisposeOnSigterm = isNil(params.shouldDisposeOnSigterm) ? true : !!params.shouldDisposeOnSigterm
  const onDbError = params.onDbError || noop
  const onFailedPublish = params.onFailedPublish || noop
  const messages = db.collection<OutboxMessage<Event>>(OutboxMessagesCollectionName)
  const addMessage = async (event: Event | Event[], partitionKey: string, session?: ClientSession) =>
    Array.isArray(event)
      ? await messages.insertMany(
          event.map((data) => ({
            _id: new ObjectId(),
            partitionKey,
            occurredAt: new Date(),
            data,
          })),
          { session },
        )
      : await messages.insertOne(
          {
            _id: new ObjectId(),
            partitionKey,
            occurredAt: new Date(),
            data: event,
          },
          { session },
        )

  return {
    async start() {
      await ensureIndexes(db)

      const consumer = await getConsumer(db, partitionKey)
      const watchCursor = createChangeStream<Event>(messages, partitionKey, consumer.resumeToken)
      const _waitUntilEventIsSent = async (event: Event) => {
        let published = false

        while (!watchCursor.closed) {
          try {
            await _publishEvent(event)
            published = true
            break
          } catch (error) {
            onFailedPublish(error)
            await setTimeout(waitAfterFailedPublishMs)
            continue
          }
        }

        return published
      }
      const watch = async () => {
        try {
          while (!watchCursor.closed) {
            if (await watchCursor.hasNext()) {
              const { _id: resumeToken, operationType, fullDocument: message, documentKey } = await watchCursor.next()

              if (operationType !== 'insert') {
                continue
              }

              if (await _waitUntilEventIsSent(message.data)) {
                await consumer.update(documentKey._id, resumeToken)
              }
            }
          }
        } catch (error) {
          onDbError(error)
          await setTimeout(waitAfterFailedPublishMs)
        }
      }

      watch().finally(() => swallow(() => watchCursor.close()))

      const stop = async function stop() {
        if (!watchCursor.closed) {
          await watchCursor.close()
        }
      }

      if (shouldDisposeOnSigterm) {
        addDisposeOnSigterm(stop)
      }

      return stop
    },

    async publishEvent(
      event: Event | Event[],
      sessionOrCallback?: ClientSession | ((session: ClientSession, db: Db, client: MongoClient) => Promise<void>),
    ) {
      if (sessionOrCallback instanceof ClientSession || !sessionOrCallback) {
        await addMessage(event, partitionKey, sessionOrCallback)
      } else {
        await client.withSession(async (session) => {
          await session.withTransaction(async (session) => {
            await sessionOrCallback(session, db, client)
            await addMessage(event, partitionKey, session)
          })
        })
      }
    },
  }
}
