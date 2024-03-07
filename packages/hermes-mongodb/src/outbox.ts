import {
  CancellationPromise,
  OutboxMessagesCollectionName,
  addDisposeOnSigterm,
  isNil,
  swallow,
} from '@arturwojnar/hermes'
import { ClientSession, Db, MongoClient, ObjectId } from 'mongodb'
import { setTimeout } from 'node:timers/promises'
import { noop } from 'ts-essentials'
import { createChangeStream } from './createChangeStream'
import { ensureIndexes } from './ensureIndexes'
import { getConsumer } from './getConsumer'
import { ConsumerCreationParams, OutboxConsumer, OutboxMessageModel } from './typings'

/**
 * OutboxConsumer is rensposible for consuming events from one partition (`partitionKey` option)
 * and publishing it through an `publishEvent` callback.
 *
 * @template Event - Events handled by the `OutboxConsumer`.
 * @param params - `OutboxConsumer` configuration.
 * @returns An `OutboxConsumer` instance.
 */
export const createOutboxConsumer = <Event>(params: ConsumerCreationParams<Event>): OutboxConsumer<Event> => {
  const { client, db, publish: _publish } = params
  const partitionKey = params.partitionKey || 'default'
  const waitAfterFailedPublishMs = params.waitAfterFailedPublishMs || 1000
  const shouldDisposeOnSigterm = isNil(params.shouldDisposeOnSigterm) ? true : !!params.shouldDisposeOnSigterm
  const onDbError = params.onDbError || noop
  const onFailedPublish = params.onFailedPublish || noop
  const messages = db.collection<OutboxMessageModel<Event>>(OutboxMessagesCollectionName)
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
  // the promise will be resolved when `stop` method is called.
  // with that promise it's not possible to call the `start` for the second time,
  // which is important for stopping and resuming the outbox instance
  let shouldStopPromise: CancellationPromise<unknown> = CancellationPromise.resolved(undefined)

  return {
    async start() {
      await ensureIndexes(db)

      await shouldStopPromise
      shouldStopPromise = new CancellationPromise()

      const consumer = await getConsumer(db, partitionKey)
      const watchCursor = createChangeStream<Event>(messages, partitionKey, consumer.resumeToken)
      const _waitUntilEventIsSent = async (event: Event) => {
        let published = false

        while (!watchCursor.closed) {
          try {
            await _publish(event)

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
        while (!watchCursor.closed) {
          try {
            const result = await Promise.race([shouldStopPromise, watchCursor.hasNext()])
            if (result === null) {
              await watchCursor.close()
              break
            }
            if (result) {
              const { _id: resumeToken, operationType, fullDocument: message, documentKey } = await watchCursor.next()

              if (operationType !== 'insert') {
                continue
              }

              if (await _waitUntilEventIsSent(message.data)) {
                await consumer.update(documentKey._id, resumeToken)
              }
            }
          } catch (error) {
            onDbError(error)
            await setTimeout(waitAfterFailedPublishMs)
          }
        }
      }

      watch()
        .catch(console.error)
        .finally(() => swallow(() => watchCursor.close()))

      const stop = async function stop() {
        if (!watchCursor.closed) {
          shouldStopPromise && shouldStopPromise.resolve(null)
          await watchCursor.close()
        }
      }

      if (shouldDisposeOnSigterm) {
        addDisposeOnSigterm(stop)
      }

      return stop
    },

    async publish(
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
