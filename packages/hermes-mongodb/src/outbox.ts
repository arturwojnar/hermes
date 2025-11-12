import { CancellationPromise, addDisposeOnSigterm, assertDate, isNil, swallow } from '@arturwojnar/hermes'
import { ClientSession, Db, MongoClient, ObjectId } from 'mongodb'
import { setTimeout } from 'node:timers/promises'
import { noop } from 'ts-essentials'
import { OutboxMessagesCollectionName } from './consts.js'
import { createChangeStream } from './createChangeStream.js'
import { ensureIndexes } from './ensureIndexes.js'
import { getConsumer } from './getConsumer.js'
import {
  type ConsumerCreationParams,
  type OutboxConsumer,
  type OutboxEvent,
  type OutboxMessageModel,
} from './typings.js'
import { generateVersionPolicies } from './versionPolicies.js'

/**
 * Creates a new outbox consumer instance for MongoDB.
 *
 * This is the main entry point for using Hermes MongoDB. It creates a consumer
 * that leverages MongoDB Change Streams to implement the Outbox Pattern, ensuring
 * reliable at-least-once event delivery with transactional consistency.
 *
 * ## How It Works
 *
 * 1. **Publish events** to the outbox collection within your MongoDB transactions
 * 2. **MongoDB oplog** captures changes durably (within retention window)
 * 3. **Change Streams** streams changes to Hermes in real-time
 * 4. **Hermes invokes** your `publish` callback for each event
 * 5. **Acknowledgment** happens only after successful callback completion
 *
 * ## Important: Oplog Retention
 *
 * ⚠️ **Unlike PostgreSQL WAL**, MongoDB's oplog has limited retention (typically hours).
 * If a consumer is down longer than the oplog retention window, events will be lost.
 * Monitor oplog retention with `rs.printReplicationInfo()`.
 *
 * @template Event - The type of domain events this consumer will handle (use discriminated unions)
 *
 * @param params - Configuration parameters including database connection, publish callback, and consumer settings
 *
 * @returns An {@link OutboxConsumer} instance ready to start consuming events
 *
 * @example
 * ### Basic Setup
 * ```typescript
 * import { createOutboxConsumer } from '@arturwojnar/hermes-mongodb'
 * import { MongoClient } from 'mongodb'
 *
 * type DomainEvent =
 *   | { type: 'MedicineAssigned'; patientId: string; medicineId: string }
 *   | { type: 'TaskCompleted'; taskId: string; completedAt: Date }
 *
 * const client = new MongoClient('mongodb://localhost:27017')
 * await client.connect()
 *
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   client,
 *   db: client.db('hospital'),
 *   publish: async (event) => {
 *     // IMPORTANT: Throw error on failure to trigger retry
 *     await messageBroker.publish(event)
 *   }
 * })
 *
 * // Start consuming events
 * const stop = await outbox.start()
 * ```
 *
 * @example
 * ### Transactional Event Publishing
 * ```typescript
 * // Publish event with business logic in same transaction
 * await outbox.publish(
 *   {
 *     type: 'MedicineAssigned',
 *     patientId: 'patient-123',
 *     medicineId: 'med-456'
 *   },
 *   async (session, db) => {
 *     // Store assignment in same transaction
 *     await db.collection('medicine_assignments').insertOne({
 *       patientId: 'patient-123',
 *       medicineId: 'med-456',
 *       assignedAt: new Date()
 *     }, { session })
 *   }
 * )
 * // Either both succeed or both fail - no inconsistency possible
 * ```
 *
 * @example
 * ### Multiple Events with WithScope
 * ```typescript
 * await outbox.withScope(async ({ publish }) => {
 *   // All events in same transaction
 *   await publish({ type: 'OrderCreated', orderId: '123' })
 *   await publish({ type: 'InvoiceGenerated', invoiceId: '456' })
 *   await publish({ type: 'NotificationSent', userId: 'user-789' })
 * })
 * ```
 *
 * @example
 * ### Horizontal Scaling with Partition Keys
 * ```typescript
 * // Tenant 1 consumer
 * const tenant1Outbox = createOutboxConsumer({
 *   client,
 *   db: client.db('hospital'),
 *   publish: async (event) => await broker.publish(event),
 *   partitionKey: 'tenant-abc'
 * })
 *
 * // Tenant 2 consumer (can run concurrently)
 * const tenant2Outbox = createOutboxConsumer({
 *   client,
 *   db: client.db('hospital'),
 *   publish: async (event) => await broker.publish(event),
 *   partitionKey: 'tenant-xyz'
 * })
 * ```
 *
 * @example
 * ### Graceful Shutdown
 * ```typescript
 * const stop = await outbox.start()
 *
 * process.on('SIGTERM', async () => {
 *   console.log('Shutting down gracefully...')
 *   await stop()  // Waits for in-flight events
 *   await client.close()
 *   process.exit(0)
 * })
 * ```
 *
 * @example
 * ### With Error Handling
 * ```typescript
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   client,
 *   db: client.db('hospital'),
 *   publish: async (event) => {
 *     await messageBroker.publish(event)
 *   },
 *   onFailedPublish: (error) => {
 *     console.error('Failed to publish:', error)
 *     monitoring.increment('outbox.publish.failures')
 *   },
 *   onDbError: (error) => {
 *     console.error('Database error:', error)
 *     monitoring.alert('outbox.database.error')
 *   }
 * })
 * ```
 *
 * @see {@link ConsumerCreationParams} for all configuration options
 * @see {@link OutboxConsumer} for the consumer API
 * @see {@link OutboxEvent} for event typing
 */
export const createOutboxConsumer = <Event extends OutboxEvent>(
  params: ConsumerCreationParams<Event>,
): OutboxConsumer<Event> => {
  const { client, db, publish: _publish } = params
  const partitionKey = params.partitionKey || 'default'
  const saveTimestamps = params.saveTimestamps || false
  const _now = params.now
  const now =
    typeof _now === 'function'
      ? () => {
          const value = _now()
          assertDate(value)
          return value
        }
      : () => new Date()
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
      const { supportedVersionCheckPolicy, changeStreamFullDocumentValuePolicy } = await generateVersionPolicies(db)

      supportedVersionCheckPolicy()

      await ensureIndexes(db)

      await shouldStopPromise
      shouldStopPromise = new CancellationPromise()

      const consumer = await getConsumer(db, partitionKey)
      const watchCursor = createChangeStream<Event>(
        changeStreamFullDocumentValuePolicy,
        messages,
        partitionKey,
        consumer.resumeToken,
      )
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
                if (saveTimestamps) {
                  await db
                    .collection<OutboxMessageModel<Event>>(OutboxMessagesCollectionName)
                    .updateOne({ _id: message._id }, { $set: { sentAt: now() } })
                  await consumer.update(documentKey._id, resumeToken)
                } else {
                  await consumer.update(documentKey._id, resumeToken)
                }
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
          shouldStopPromise.resolve(null)
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

    async withScope(scopeFn) {
      return await client.withSession((session) =>
        session.withTransaction(async (session) => {
          const publish = async (event: Event | Event[]) => {
            await addMessage(event, partitionKey, session)
          }

          return await scopeFn({ publish, session, client })
        }),
      )
    },
  }
}
