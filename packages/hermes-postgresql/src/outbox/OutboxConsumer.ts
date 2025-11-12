import { assert, Duration, swallow } from '@arturwojnar/hermes'
import { setTimeout } from 'node:timers/promises'
import postgres, { JSONValue, Options, PostgresType, Sql, TransactionSql } from 'postgres'
import { getSlotName, PublicationName } from '../common/consts.js'
import { ConsumerCreationParams } from '../common/ConsumerCreationParams.js'
import { HermesConsumerAlreadyTakenError } from '../common/errors.js'
import {
  HermesMessageEnvelope,
  HermesSql,
  InsertResult,
  IOutboxConsumer,
  MessageEnvelope,
  PublishOptions,
  Stop,
} from '../common/types.js'
import {
  createSerializedPublishingQueue,
  MessageToPublish,
} from '../publishingQueue/createSerializedPublishingQueue.js'
import { createNonBlockingPublishingQueue } from '../publishingQueue/nonBlockingQueue/createNonBlockingPublishingQueue.js'
import { startLogicalReplication } from '../subscribeToReplicationSlot/logicalReplicationStream.js'
import { LogicalReplicationState, Transaction } from '../subscribeToReplicationSlot/types.js'
import { killReplicationProcesses } from './killBackendReplicationProcesses.js'
import { migrate } from './migrate.js'
import { OutboxConsumerState, OutboxConsumerStore } from './OutboxConsumerState.js'

/**
 * Implementation of the Outbox Pattern for PostgreSQL using Logical Replication.
 *
 * This class manages the lifecycle of consuming messages from PostgreSQL's Write-Ahead Log (WAL)
 * via logical replication and publishing them to external message brokers. It provides:
 *
 * - **At-least-once delivery** guaranteed by PostgreSQL WAL retention
 * - **Zero message loss** through transactional consistency
 * - **Real-time streaming** without polling overhead
 * - **Horizontal scaling** via partition keys
 * - **Optional async outbox** for non-critical messages
 *
 * ## How It Works
 *
 * 1. Application queues messages to the outbox table within database transactions
 * 2. PostgreSQL WAL captures all changes durably
 * 3. Logical replication streams changes to this consumer in real-time
 * 4. Consumer invokes your `publish` callback for each message
 * 5. Messages are acknowledged only after successful publish
 *
 * @template Message - The type of domain events/messages to publish
 *
 * @example
 * Basic usage with transactional event publishing
 * ```typescript
 * import { createOutboxConsumer } from '@arturwojnar/hermes-postgresql'
 *
 * type PatientEvent =
 *   | { type: 'PatientRegistered'; patientId: string; name: string }
 *   | { type: 'PatientUpdated'; patientId: string; changes: object }
 *
 * const outbox = createOutboxConsumer<PatientEvent>({
 *   getOptions: () => ({
 *     host: 'localhost',
 *     database: 'hospital',
 *     user: 'user',
 *     password: 'pass'
 *   }),
 *   publish: async (envelopes) => {
 *     for (const envelope of envelopes) {
 *       await messageBroker.publish(envelope.message)
 *     }
 *   },
 *   consumerName: 'patient-service'
 * })
 *
 * // Start consuming
 * const stop = await outbox.start()
 *
 * // Queue events with business logic in same transaction
 * const sql = outbox.getDbConnection()
 * await sql.begin(async (tx) => {
 *   await tx`INSERT INTO patients (id, name) VALUES (${id}, ${name})`
 *   await outbox.queue({
 *     messageId: id,
 *     messageType: 'PatientRegistered',
 *     message: { type: 'PatientRegistered', patientId: id, name }
 *   }, { tx })
 * })
 * ```
 *
 * @see {@link createOutboxConsumer} - Factory function to create instances
 * @see {@link IOutboxConsumer} - Interface this class implements
 * @see {@link ConsumerCreationParams} - Configuration options
 */
export class OutboxConsumer<Message extends JSONValue> implements IOutboxConsumer<Message> {
  private _sql: HermesSql | null = null
  private _sendAsync:
    | ((message: MessageEnvelope<Message> | MessageEnvelope<Message>[], tx?: TransactionSql) => Promise<void>)
    | null = null

  /**
   * @internal
   */
  constructor(
    private readonly _params: ConsumerCreationParams<Message>,
    private readonly _createClient: (options: Options<Record<string, PostgresType>>) => HermesSql,
    private _state?: OutboxConsumerState,
  ) {}

  /**
   * Returns the consumer creation parameters used to initialize this consumer.
   *
   * Useful for debugging, logging, or creating derived consumers with modified configuration.
   *
   * @returns The original {@link ConsumerCreationParams} passed to the consumer
   *
   * @example
   * Logging consumer configuration
   * ```typescript
   * const outbox = createOutboxConsumer({ ... })
   * const params = outbox.getCreationParams()
   *
   * console.log('Consumer name:', params.consumerName)
   * console.log('Partition key:', params.partitionKey)
   * console.log('Serialization:', params.serialization)
   * ```
   *
   * @example
   * Creating a derived consumer with different partition key
   * ```typescript
   * const baseParams = outbox.getCreationParams()
   *
   * const tenant2Outbox = createOutboxConsumer({
   *   ...baseParams,
   *   partitionKey: 'tenant-2'  // Different partition, same config
   * })
   * ```
   */
  getCreationParams() {
    return this._params
  }

  /**
   * Returns the active PostgreSQL database connection.
   *
   * Use this connection for querying and transactional operations. The connection is established
   * when {@link start} is called and remains active until the consumer is stopped.
   *
   * @returns The active postgres.js {@link HermesSql} connection instance
   *
   * @throws {Error} If called before {@link start} - connection not yet established
   *
   * @example
   * Querying within the same database connection
   * ```typescript
   * const outbox = createOutboxConsumer({ ... })
   * await outbox.start()
   *
   * const sql = outbox.getDbConnection()
   *
   * // Use for business queries
   * const patients = await sql`SELECT * FROM patients WHERE active = true`
   *
   * // Use for transactional event publishing
   * await sql.begin(async (tx) => {
   *   const [patient] = await tx`
   *     INSERT INTO patients (id, name) VALUES (${id}, ${name})
   *     RETURNING *
   *   `
   *   await outbox.queue({
   *     messageId: patient.id,
   *     messageType: 'PatientRegistered',
   *     message: { type: 'PatientRegistered', patientId: patient.id }
   *   }, { tx })
   * })
   * ```
   *
   * @example
   * Error handling when called too early
   * ```typescript
   * const outbox = createOutboxConsumer({ ... })
   *
   * try {
   *   const sql = outbox.getDbConnection()  // Throws!
   * } catch (error) {
   *   console.error('Must call start() first')
   * }
   *
   * await outbox.start()
   * const sql = outbox.getDbConnection()  // Now works
   * ```
   *
   * @see {@link start} - Must be called first to establish connection
   * @see {@link queue} - Uses this connection for message insertion
   */
  getDbConnection() {
    assert(this._sql, `A connection hasn't been yet established.`)
    return this._sql
  }

  /**
   * Starts the outbox consumer and begins processing messages via PostgreSQL logical replication.
   *
   * This method:
   * 1. Establishes database connections (one for queries, one for replication)
   * 2. Runs database migrations to create outbox table and replication slot
   * 3. Loads or creates consumer state for LSN tracking
   * 4. Starts streaming changes from PostgreSQL WAL
   * 5. Optionally starts async outbox consumer (if configured)
   *
   * The consumer will continue running until the returned stop function is called.
   *
   * @returns A promise that resolves to a {@link Stop} function. Call this function to gracefully
   * shutdown the consumer and close all connections.
   *
   * @throws {HermesConsumerAlreadyTakenError} If another consumer is already using this replication
   * slot (same consumerName + partitionKey combination). Only one consumer can use a replication
   * slot at a time.
   *
   * @throws {Error} If database connection fails, migrations fail, or logical replication cannot
   * be established
   *
   * @example
   * Basic start and stop
   * ```typescript
   * const outbox = createOutboxConsumer({ ... })
   *
   * // Start consuming
   * const stop = await outbox.start()
   * console.log('Outbox consumer started')
   *
   * // Later, gracefully shutdown
   * await stop()
   * console.log('Outbox consumer stopped')
   * ```
   *
   * @example
   * Handling already-taken consumer error
   * ```typescript
   * import { HermesConsumerAlreadyTakenError } from '@arturwojnar/hermes-postgresql'
   *
   * try {
   *   const stop = await outbox.start()
   * } catch (error) {
   *   if (error instanceof HermesConsumerAlreadyTakenError) {
   *     console.error('Consumer is already running elsewhere')
   *     console.error('Consumer name:', error.consumerName)
   *     console.error('Partition key:', error.partitionKey)
   *
   *     // Options:
   *     // 1. Stop the other consumer first
   *     // 2. Use a different partition key
   *     // 3. Use a different consumer name
   *   }
   *   throw error
   * }
   * ```
   *
   * @example
   * Graceful shutdown with timeout
   * ```typescript
   * const outbox = createOutboxConsumer({ ... })
   * const stop = await outbox.start()
   *
   * // Handle shutdown signals
   * process.on('SIGTERM', async () => {
   *   console.log('Shutting down...')
   *
   *   // Stop consumer with timeout
   *   const timeout = setTimeout(() => {
   *     console.error('Shutdown timeout, forcing exit')
   *     process.exit(1)
   *   }, 5000)
   *
   *   await stop()
   *   clearTimeout(timeout)
   *   console.log('Shutdown complete')
   * })
   * ```
   *
   * @example
   * Running multiple consumers with different partition keys
   * ```typescript
   * // Scale horizontally by partitioning
   * const tenant1Outbox = createOutboxConsumer({
   *   // ... connection config
   *   consumerName: 'billing-service',
   *   partitionKey: 'tenant-1'
   * })
   *
   * const tenant2Outbox = createOutboxConsumer({
   *   // ... connection config
   *   consumerName: 'billing-service',
   *   partitionKey: 'tenant-2'
   * })
   *
   * // Both can run simultaneously
   * const stop1 = await tenant1Outbox.start()
   * const stop2 = await tenant2Outbox.start()
   *
   * // Later, stop both
   * await Promise.all([stop1(), stop2()])
   * ```
   *
   * @see {@link Stop} - The returned shutdown function type
   * @see {@link HermesConsumerAlreadyTakenError} - Error when slot is already taken
   * @see {@link ConsumerCreationParams.partitionKey} - For horizontal scaling
   */
  async start(): Promise<Stop> {
    const { publish, getOptions, consumerName } = this._params
    const partitionKey = this._params.partitionKey || 'default'
    const slotName = getSlotName(consumerName, partitionKey)
    const onPublish = async ({ transaction, acknowledge }: MessageToPublish<InsertResult>) => {
      assert(this._state)

      const messages = transaction.results.map<HermesMessageEnvelope<Message>>((result) => ({
        position: result.position,
        messageId: result.messageId,
        messageType: result.messageType,
        lsn: transaction.lsn,
        redeliveryCount: this._state?.redeliveryCount || 0,
        message: JSON.parse(result.payload) as Message,
      }))

      await publish(messages)
    }
    const onFailedPublish = async (tx: Transaction<InsertResult>) => {
      assert(this._state)
      await this._state.reportFailedDelivery(tx.lsn)
    }
    const createPublishingQueue = this._params.serialization
      ? createSerializedPublishingQueue
      : createNonBlockingPublishingQueue
    const publishingQueue = createPublishingQueue<InsertResult>(onPublish, {
      onFailedPublish,
      waitAfterFailedPublish: this._params.waitAfterFailedPublish || Duration.ofSeconds(30),
    })
    const sql = (this._sql = this._createClient({
      ...getOptions(),
    }))
    const subscribeSql = this._createClient({
      ...getOptions(),
      publications: PublicationName,
      transform: { column: {}, value: {}, row: {} },
      max: 1,
      fetch_types: false,
      idle_timeout: undefined,
      max_lifetime: null,
      connection: {
        application_name: slotName,
        replication: 'database',
      },
      onclose: async () => {
        // await dropReplicationSlot(sql, 'hermes_slot')
        // if (ended)
        //   return
        // stream = null
        // state.pid = state.secret = undefined
        // connected(await init(sql, slot, options.publications))
        // subscribers.forEach(event => event.forEach(({ onsubscribe }) => onsubscribe()))
      },
    })

    if (!this._state) {
      this._state = new OutboxConsumerState(new OutboxConsumerStore(sql, consumerName, partitionKey))
    }

    await migrate(sql, slotName)

    await this._state.createOrLoad(partitionKey)

    const replicationState: LogicalReplicationState = {
      lastProcessedLsn: this._state.lastProcessedLsn,
      timestamp: new Date(),
      publication: PublicationName,
      slotName,
    }

    try {
      await startLogicalReplication<InsertResult>({
        state: replicationState,
        sql: subscribeSql,
        columnConfig: {
          position: 'bigint',
          messageId: 'text',
          messageType: 'text',
          partitionKey: 'text',
          payload: 'jsonb',
        },
        onInsert: async (transaction, acknowledge) => {
          const message = {
            transaction,
            acknowledge: async () => {
              assert(this._state)
              acknowledge()
              await this._state.moveFurther(transaction.lsn)
            },
          }
          publishingQueue.queue(message)
          await publishingQueue.run(message)
          // await sql.begin(async (sql) => {
          //   await publishingQueue.run(message)
          // })
        },
      })
    } catch (e) {
      if (e instanceof postgres.PostgresError && (e.routine === 'ReplicationSlotAcquire' || e.code === '55006')) {
        throw new HermesConsumerAlreadyTakenError({ consumerName, partitionKey })
      }

      throw e
    }

    let asyncOutboxStop: Stop | undefined

    if (this._params.asyncOutbox) {
      const asyncOutbox = this._params.asyncOutbox(this)
      asyncOutboxStop = asyncOutbox.start()

      this._sendAsync = async (message, tx) => {
        await asyncOutbox.send(message, { tx })
      }
    }

    return async () => {
      const timeout = Duration.ofSeconds(1).ms

      await swallow(() => killReplicationProcesses(this._sql!, slotName))
      await Promise.all([
        swallow(() => this._sql?.end({ timeout })),

        Promise.race([swallow(() => subscribeSql?.end({ timeout })), setTimeout(timeout)]),
        swallow(() => (asyncOutboxStop ? asyncOutboxStop() : Promise.resolve())),
      ])

      this._state = undefined
    }
  }

  /**
   * Queues one or more messages to the main outbox table for delivery via logical replication.
   *
   * Messages are inserted into the `outbox` table and will be streamed via PostgreSQL WAL to the
   * consumer's `publish` callback. This method ensures:
   *
   * - **Transactional consistency** - Messages committed only if transaction succeeds
   * - **At-least-once delivery** - WAL guarantees messages won't be lost
   * - **Zero data/event inconsistency** - Business logic and events in same transaction
   *
   * ## Transaction Behavior
   *
   * - If `options.tx` is provided, uses that transaction
   * - If already in a transaction (savepoint exists), uses current transaction
   * - Otherwise, creates a new transaction automatically
   *
   * ## Array Handling
   *
   * When queuing multiple messages:
   * - All messages inserted in same transaction
   * - Either all succeed or all fail (atomicity guaranteed)
   * - Messages delivered in order within same partition key
   *
   * @param message - A single message or array of messages to queue
   * @param options - Optional configuration
   * @param options.tx - PostgreSQL transaction to use (recommended for consistency)
   * @param options.partitionKey - Partition key for horizontal scaling (default: 'default')
   *
   * @returns Promise that resolves when message(s) are committed to outbox table
   *
   * @throws {Error} If database insertion fails or connection is not established
   *
   * @example
   * Queue message with business logic in same transaction
   * ```typescript
   * const outbox = createOutboxConsumer<PatientEvent>({ ... })
   * await outbox.start()
   *
   * const sql = outbox.getDbConnection()
   *
   * await sql.begin(async (tx) => {
   *   // Insert business data
   *   const [patient] = await tx`
   *     INSERT INTO patients (id, name, email)
   *     VALUES (${id}, ${name}, ${email})
   *     RETURNING *
   *   `
   *
   *   // Queue event - guaranteed consistent with data
   *   await outbox.queue({
   *     messageId: patient.id,
   *     messageType: 'PatientRegistered',
   *     message: {
   *       type: 'PatientRegistered',
   *       patientId: patient.id,
   *       name: patient.name
   *     }
   *   }, { tx })
   * })
   * // Either both succeed or both fail - no inconsistency possible
   * ```
   *
   * @example
   * Queue multiple messages atomically
   * ```typescript
   * await sql.begin(async (tx) => {
   *   // Update order status
   *   await tx`UPDATE orders SET status = 'completed' WHERE id = ${orderId}`
   *
   *   // Queue multiple related events
   *   await outbox.queue([
   *     {
   *       messageId: `order-${orderId}-completed`,
   *       messageType: 'OrderCompleted',
   *       message: { type: 'OrderCompleted', orderId }
   *     },
   *     {
   *       messageId: `invoice-${orderId}`,
   *       messageType: 'InvoiceGenerated',
   *       message: { type: 'InvoiceGenerated', orderId, amount: 100 }
   *     }
   *   ], { tx })
   * })
   * ```
   *
   * @example
   * Using partition keys for horizontal scaling
   * ```typescript
   * // Queue events to different partitions
   * await sql.begin(async (tx) => {
   *   await tx`INSERT INTO tenant1_data ...`
   *   await outbox.queue(
   *     { messageId: '1', messageType: 'DataChanged', message: event1 },
   *     { tx, partitionKey: 'tenant-1' }
   *   )
   *
   *   await tx`INSERT INTO tenant2_data ...`
   *   await outbox.queue(
   *     { messageId: '2', messageType: 'DataChanged', message: event2 },
   *     { tx, partitionKey: 'tenant-2' }
   *   )
   * })
   * ```
   *
   * @example
   * Queue without explicit transaction (auto-transaction)
   * ```typescript
   * // Hermes creates transaction automatically
   * await outbox.queue({
   *   messageId: '123',
   *   messageType: 'NotificationSent',
   *   message: { type: 'NotificationSent', userId: '123' }
   * })
   * // Message inserted in its own transaction
   * ```
   *
   * @example
   * Deterministic message IDs for idempotency
   * ```typescript
   * import { createHash } from 'crypto'
   *
   * // Generate deterministic ID from business data
   * const messageId = createHash('sha256')
   *   .update(`patient-registered-${patient.id}`)
   *   .digest('hex')
   *
   * await sql.begin(async (tx) => {
   *   await tx`INSERT INTO patients ...`
   *   await outbox.queue({
   *     messageId,  // Same patient.id always generates same messageId
   *     messageType: 'PatientRegistered',
   *     message: { type: 'PatientRegistered', patientId: patient.id }
   *   }, { tx })
   * })
   * // If transaction retries, same messageId prevents duplicate events
   * ```
   *
   * @see {@link MessageEnvelope} - Message structure
   * @see {@link PublishOptions} - Options for partitioning
   * @see {@link send} - For async outbox (non-WAL based)
   */
  async queue(message: MessageEnvelope<Message> | MessageEnvelope<Message>[], options?: PublishOptions): Promise<void> {
    assert(this._sql)

    const partitionKey = options?.partitionKey || 'default'
    const sql = options?.tx || this._sql

    if (Array.isArray(message)) {
      if ('savepoint' in sql) {
        for (const m of message) {
          await this._publishOne(sql, m, partitionKey)
        }
      } else {
        await sql.begin(async (sql) => {
          for (const m of message) {
            await this._publishOne(sql, m, partitionKey)
          }
        })
      }
    } else {
      await this._publishOne(sql, message, partitionKey)
    }
  }

  /**
   * Sends one or more messages to the async outbox for delivery via polling.
   *
   * The async outbox is a separate, polling-based queue for **non-critical messages** like:
   * - Compensation commands
   * - Cleanup operations
   * - Notifications
   * - Telemetry events
   *
   * Unlike {@link queue}, messages sent via `send()`:
   * - ✅ Don't consume WAL storage (keeps WAL clean)
   * - ✅ Suitable for high-volume, non-critical events
   * - ❌ No at-least-once delivery guarantee during crashes
   * - ❌ Polling-based (slightly higher latency)
   *
   * ## When to Use `send()` vs `queue()`
   *
   * Use `send()` (async outbox) for:
   * - Compensation commands that can be retried
   * - Non-critical notifications
   * - Telemetry/analytics events
   * - Cleanup operations
   *
   * Use {@link queue} (main outbox) for:
   * - Critical business events
   * - Events that must be delivered
   * - Events requiring transactional consistency
   * - Events in the critical path
   *
   * ## Configuration Required
   *
   * The async outbox must be enabled during consumer creation:
   *
   * ```typescript
   * import { useBasicAsyncOutboxConsumerPolicy } from '@arturwojnar/hermes-postgresql'
   *
   * const outbox = createOutboxConsumer({
   *   // ... other config
   *   asyncOutbox: useBasicAsyncOutboxConsumerPolicy()
   * })
   * ```
   *
   * @param message - A single message or array of messages to send
   * @param tx - Optional PostgreSQL transaction to use
   *
   * @returns Promise that resolves when message(s) are inserted into async outbox table
   *
   * @throws {Error} If async outbox hasn't been initialized (check `asyncOutbox` parameter in
   * {@link ConsumerCreationParams})
   *
   * @example
   * Using async outbox for compensations
   * ```typescript
   * import { useBasicAsyncOutboxConsumerPolicy } from '@arturwojnar/hermes-postgresql'
   *
   * const outbox = createOutboxConsumer({
   *   // ... connection config
   *   asyncOutbox: useBasicAsyncOutboxConsumerPolicy(),
   *   publish: async (envelopes) => {
   *     for (const envelope of envelopes) {
   *       await broker.publish(envelope.message)
   *     }
   *   },
   *   consumerName: 'order-service'
   * })
   *
   * await outbox.start()
   *
   * const sql = outbox.getDbConnection()
   *
   * await sql.begin(async (tx) => {
   *   // Critical business event - use main outbox (WAL-based)
   *   await tx`INSERT INTO orders (id, status) VALUES (${id}, 'pending')`
   *   await outbox.queue({
   *     messageId: id,
   *     messageType: 'OrderCreated',
   *     message: { type: 'OrderCreated', orderId: id }
   *   }, { tx })
   *
   *   // Non-critical compensation - use async outbox (polling-based)
   *   await outbox.send({
   *     messageId: `cleanup-${id}`,
   *     messageType: 'CleanupScheduled',
   *     message: { type: 'CleanupScheduled', orderId: id, delay: 3600 }
   *   }, tx)
   * })
   * ```
   *
   * @example
   * Error handling when async outbox not configured
   * ```typescript
   * const outbox = createOutboxConsumer({
   *   // ... config WITHOUT asyncOutbox
   * })
   *
   * await outbox.start()
   *
   * try {
   *   await outbox.send({
   *     messageId: '123',
   *     messageType: 'Notification',
   *     message: { type: 'Notification', text: 'Hello' }
   *   })
   * } catch (error) {
   *   console.error("AsyncOutbox hasn't been initialized")
   *   // Solution: Add asyncOutbox to consumer config
   * }
   * ```
   *
   * @example
   * High-volume analytics events
   * ```typescript
   * // Analytics events don't need WAL guarantees
   * await outbox.send([
   *   {
   *     messageId: `page-view-${Date.now()}-1`,
   *     messageType: 'PageView',
   *     message: { type: 'PageView', page: '/home', userId: '123' }
   *   },
   *   {
   *     messageId: `page-view-${Date.now()}-2`,
   *     messageType: 'PageView',
   *     message: { type: 'PageView', page: '/products', userId: '456' }
   *   }
   * ])
   * // Sent via polling, doesn't consume WAL storage
   * ```
   *
   * @example
   * Mixing critical and non-critical events
   * ```typescript
   * await sql.begin(async (tx) => {
   *   // Critical: Payment processed
   *   await tx`UPDATE payments SET status = 'completed' WHERE id = ${paymentId}`
   *   await outbox.queue({
   *     messageId: paymentId,
   *     messageType: 'PaymentCompleted',
   *     message: { type: 'PaymentCompleted', paymentId, amount: 100 }
   *   }, { tx })
   *
   *   // Non-critical: Send email notification
   *   await outbox.send({
   *     messageId: `email-${paymentId}`,
   *     messageType: 'SendEmailNotification',
   *     message: {
   *       type: 'SendEmailNotification',
   *       to: 'user@example.com',
   *       subject: 'Payment Received'
   *     }
   *   }, tx)
   * })
   * ```
   *
   * @see {@link queue} - For critical events via WAL
   * @see {@link useBasicAsyncOutboxConsumerPolicy} - How to enable async outbox
   * @see {@link ConsumerCreationParams.asyncOutbox} - Configuration option
   */
  async send(message: MessageEnvelope<Message> | MessageEnvelope<Message>[], tx?: TransactionSql) {
    if (this._sendAsync === null) {
      throw new Error(`AsyncOutbox hasn't been initialized.`)
    }

    return await this._sendAsync(message, tx)
  }

  private async _publishOne(sql: Sql, message: MessageEnvelope<Message>, partitionKey = 'default') {
    await sql`INSERT INTO outbox ("messageId", "messageType", "partitionKey", "data") VALUES(${message.messageId}, ${message.messageType}, ${partitionKey}, ${sql.json(message.message)})`
  }
}
