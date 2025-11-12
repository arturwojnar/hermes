import { JSONValue, Sql, TransactionSql } from 'postgres'
import { DeepReadonly } from 'ts-essentials'
import { ConsumerCreationParams } from './ConsumerCreationParams.js'

/**
 * Envelope containing a message along with Hermes-specific metadata.
 *
 * This type is passed to your `publish` callback when Hermes delivers messages
 * from the PostgreSQL replication stream.
 *
 * @template Message - The type of the domain message/event
 *
 * @example
 * ```typescript
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   // ...
 *   publish: async (envelope: HermesMessageEnvelope<DomainEvent>) => {
 *     console.log(`Delivering message ${envelope.messageId}`)
 *     console.log(`Attempt #${envelope.redeliveryCount + 1}`)
 *     console.log(`LSN: ${envelope.lsn}`)
 *
 *     await messageBroker.publish(envelope.message)
 *   }
 * })
 * ```
 *
 * @see {@link MessageEnvelope} for the simplified envelope used when queueing messages
 */
type HermesMessageEnvelope<Message extends JSONValue> = {
  /** Unique sequential position in the outbox table (auto-incremented) */
  position: number | bigint
  /** Unique identifier for this message (user-provided, used for idempotency) */
  messageId: string
  /** Type discriminator for the message (e.g., 'PatientRegistered', 'OrderCreated') */
  messageType: string
  /** Log Sequence Number from PostgreSQL WAL (indicates position in replication stream) */
  lsn: string
  /** Number of times delivery has been attempted (0 for first delivery) */
  redeliveryCount: number
  /** The actual domain message/event data */
  message: Message
}

/**
 * Simplified message envelope for queueing messages into the outbox.
 *
 * This is the type you use when calling `outbox.queue()` or `outbox.send()`.
 * Hermes will add additional metadata (position, LSN, redeliveryCount) when
 * delivering the message via the {@link HermesMessageEnvelope}.
 *
 * @template Message - The type of the domain message/event
 *
 * @example
 * ```typescript
 * // Generate deterministic message ID
 * const messageId = constructMessageId('PatientRegistered', patientId)
 *
 * const envelope: MessageEnvelope<PatientRegisteredEvent> = {
 *   messageId,
 *   messageType: 'PatientRegistered',
 *   message: {
 *     type: 'PatientRegistered',
 *     data: { patientId, name, email }
 *   }
 * }
 *
 * // Queue with business logic in same transaction
 * await sql.begin(async (sql) => {
 *   await storePatient(patient, sql)
 *   await outbox.queue(envelope, { tx: sql })
 * })
 * ```
 *
 * @see {@link HermesMessageEnvelope} for the full envelope received in publish callback
 */
type MessageEnvelope<Message extends JSONValue> = {
  /** Unique identifier for this message. Must be deterministic for idempotency. */
  messageId: string
  /** Type discriminator for the message (e.g., 'PatientRegistered', 'OrderCreated') */
  messageType: string
  /** The actual domain message/event data */
  message: Message
}

/**
 * Internal type representing the result of inserting a message into the outbox table.
 * @internal
 */
type InsertResult = {
  /** Auto-incremented position in the outbox table */
  position: number | bigint
  /** User-provided unique message identifier */
  messageId: string
  /** Type discriminator for the message */
  messageType: string
  /** Partition key for horizontal scaling */
  partitionKey: string
  /** JSON-serialized message data */
  payload: string
}

/**
 * Function type that starts the outbox consumer and returns a stop function.
 *
 * @returns Promise that resolves to a {@link Stop} function
 *
 * @example
 * ```typescript
 * const stopOutbox = await outbox.start()
 *
 * // Later, to stop gracefully:
 * await stopOutbox()
 * ```
 */
type Start = () => Promise<Stop>

/**
 * Function type that stops the outbox consumer and cleans up resources.
 *
 * This function:
 * - Stops consuming from PostgreSQL Logical Replication
 * - Waits for in-flight messages to complete
 * - Closes database connections
 * - Cleans up the replication slot
 *
 * @returns Promise that resolves when shutdown is complete
 *
 * @example
 * ```typescript
 * const stopOutbox = await outbox.start()
 *
 * process.on('SIGTERM', async () => {
 *   await stopOutbox()
 *   process.exit(0)
 * })
 * ```
 */
type Stop = () => Promise<void>

/**
 * Options for publishing messages to the outbox.
 *
 * @example
 * ```typescript
 * // Queue message in same transaction as business logic
 * await sql.begin(async (sql) => {
 *   await storePatient(patient, sql)
 *   await outbox.queue(event, { tx: sql }) // Atomic operation
 * })
 *
 * // Queue message with custom partition key (for horizontal scaling)
 * await outbox.queue(event, { partitionKey: 'tenant-123' })
 * ```
 */
type PublishOptions = {
  /** Optional partition key for horizontal scaling. Messages with the same partition key are processed by the same consumer. */
  partitionKey?: string
  /** Optional transaction to include the message in. When provided, the message is only committed if the transaction succeeds. */
  tx?: TransactionSql
}

/**
 * Function type for publishing messages to the outbox.
 *
 * @template Message - The type of the domain message/event
 *
 * @param message - Single message or array of messages to publish
 * @param options - Optional {@link PublishOptions} for transaction and partitioning
 *
 * @returns Promise that resolves when message(s) are inserted into outbox table
 *
 * @throws {Error} If message insertion fails
 *
 * @example
 * ```typescript
 * // Queue single message
 * await outbox.queue(event)
 *
 * // Queue multiple messages atomically
 * await outbox.queue([event1, event2, event3])
 *
 * // Queue with transaction for consistency
 * await sql.begin(async (sql) => {
 *   await db.updateInventory(item, sql)
 *   await outbox.queue(inventoryUpdatedEvent, { tx: sql })
 * })
 * ```
 */
type Publish<Message extends JSONValue> = (
  message: MessageEnvelope<Message> | MessageEnvelope<Message>[],
  options?: PublishOptions,
) => Promise<void>

/**
 * Interface for the Outbox Consumer.
 *
 * This is the main interface for interacting with Hermes PostgreSQL.
 * It provides methods for starting the consumer, queueing messages,
 * and accessing the database connection.
 *
 * @template Message - The type of the domain message/event
 *
 * @example
 * ```typescript
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   getOptions: () => ({
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'mydb',
 *     user: 'user',
 *     password: 'pass'
 *   }),
 *   publish: async (envelope) => {
 *     await messageBroker.publish(envelope.message)
 *   },
 *   consumerName: 'my-service'
 * })
 *
 * // Start consuming
 * const stop = await outbox.start()
 *
 * // Queue message with business logic
 * await sql.begin(async (sql) => {
 *   await updateData(sql)
 *   await outbox.queue(event, { tx: sql })
 * })
 * ```
 *
 * @see {@link createOutboxConsumer} for creating instances
 */
type IOutboxConsumer<Message extends JSONValue> = {
  /** Starts consuming messages from PostgreSQL Logical Replication */
  start: Start
  /** Queues messages to the primary outbox (WAL-based, guaranteed delivery) */
  queue: Publish<Message>
  /** Sends messages to the async outbox (polling-based, eventual delivery) */
  send: (message: MessageEnvelope<Message> | MessageEnvelope<Message>[], tx?: TransactionSql) => Promise<void>
  /** Gets the underlying PostgreSQL connection */
  getDbConnection(): Sql
  /** Gets the consumer configuration parameters */
  getCreationParams(): DeepReadonly<ConsumerCreationParams<Message>>
}

/**
 * Function type that returns the current date/time.
 *
 * Used internally for timestamping operations. Can be overridden for testing.
 *
 * @returns Current date/time
 *
 * @example
 * ```typescript
 * const outbox = createOutboxConsumer({
 *   // ...
 *   now: () => new Date('2024-01-01T00:00:00Z') // For testing
 * })
 * ```
 */
type NowFunction = () => Date

/**
 * Callback function type for handling errors.
 *
 * Used for error handling hooks like `onFailedPublish` and `onDbError`.
 *
 * @param error - The error that occurred
 *
 * @example
 * ```typescript
 * const outbox = createOutboxConsumer({
 *   // ...
 *   onFailedPublish: (error) => {
 *     console.error('Failed to publish message:', error)
 *     monitoring.trackError(error)
 *   },
 *   onDbError: (error) => {
 *     console.error('Database error:', error)
 *     alertOps(error)
 *   }
 * })
 * ```
 */
type ErrorCallback = (error: unknown) => void

/**
 * PostgreSQL connection type configured for Hermes.
 *
 * This is a Postgres.js connection configured with:
 * - BigInt support for handling large position values
 * - Logical replication capabilities
 * - Appropriate connection pooling
 *
 * @see {@link https://github.com/porsager/postgres} Postgres.js documentation
 */
type HermesSql = Sql<{
  bigint: bigint
}>

export type {
  ErrorCallback,
  HermesMessageEnvelope,
  HermesSql,
  InsertResult,
  IOutboxConsumer,
  MessageEnvelope,
  NowFunction,
  Publish,
  PublishOptions,
  Start,
  Stop,
}
