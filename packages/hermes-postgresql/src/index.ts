/**
 * @packageDocumentation
 *
 * # Hermes PostgreSQL
 *
 * Production-ready implementation of the Outbox Pattern for PostgreSQL using Logical Replication.
 *
 * ## Features
 *
 * - ✅ **At-least-once delivery** guaranteed by PostgreSQL WAL
 * - ✅ **Zero message loss** - WAL retained until acknowledged
 * - ✅ **Real-time streaming** via Logical Replication (no polling)
 * - ✅ **Transactional consistency** between data and events
 * - ✅ **Horizontal scaling** with partition keys
 * - ✅ **Async outbox** for non-critical messages
 *
 * ## Installation
 *
 * ```bash
 * npm install @arturwojnar/hermes @arturwojnar/hermes-postgresql
 * ```
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createOutboxConsumer } from '@arturwojnar/hermes-postgresql'
 *
 * type DomainEvent =
 *   | { type: 'PatientRegistered'; data: { patientId: string } }
 *   | { type: 'OrderCreated'; data: { orderId: string } }
 *
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   getOptions: () => ({
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'mydb',
 *     user: 'user',
 *     password: 'pass'
 *   }),
 *   publish: async (envelope) => {
 *     // Publish to your message broker
 *     await messageBroker.publish(envelope.message)
 *   },
 *   consumerName: 'my-service'
 * })
 *
 * // Start consuming
 * const stop = await outbox.start()
 *
 * // Queue messages with transactional consistency
 * await sql.begin(async (sql) => {
 *   await storeData(data, sql)
 *   await outbox.queue(event, { tx: sql })
 * })
 * ```
 *
 * ## Key Concepts
 *
 * ### Transactional Event Publishing
 *
 * The core pattern ensures events are only published if data operations succeed:
 *
 * ```typescript
 * await sql.begin(async (sql) => {
 *   // Business logic
 *   await db.collection('users').insertOne(user, sql)
 *
 *   // Event publishing - same transaction!
 *   await outbox.queue(userCreatedEvent, { tx: sql })
 * })
 * // Either both succeed or both fail - no inconsistency possible
 * ```
 *
 * ### At-Least-Once Delivery
 *
 * Hermes guarantees delivery via the publish callback:
 *
 * ```typescript
 * publish: async (envelope) => {
 *   // ✅ Success: Message acknowledged, won't redeliver
 *   await broker.publish(envelope.message)
 *
 *   // ❌ Throws: Message not acknowledged, will retry
 *   throw new Error('Broker unavailable')
 * }
 * ```
 *
 * ### Idempotent Handlers
 *
 * Since messages may be delivered multiple times, handlers must be idempotent:
 *
 * ```typescript
 * publish: async (envelope) => {
 *   // Check if already processed
 *   if (await isProcessed(envelope.messageId)) {
 *     return // Safe to skip
 *   }
 *
 *   await handleMessage(envelope)
 *   await markProcessed(envelope.messageId)
 * }
 * ```
 *
 * ### PostgreSQL Configuration
 *
 * Enable logical replication in your PostgreSQL configuration:
 *
 * ```ini
 * # postgresql.conf
 * wal_level = logical
 * max_replication_slots = 10
 * max_wal_senders = 10
 * ```
 *
 * ## Advanced Features
 *
 * ### Async Outbox for Compensations
 *
 * Use a separate async outbox for non-critical messages:
 *
 * ```typescript
 * import { useBasicAsyncOutboxConsumerPolicy } from '@arturwojnar/hermes-postgresql'
 *
 * const outbox = createOutboxConsumer({
 *   // ...
 *   asyncOutbox: useBasicAsyncOutboxConsumerPolicy()
 * })
 *
 * // Critical events use main outbox (WAL-based)
 * await outbox.queue(criticalEvent, { tx: sql })
 *
 * // Compensations use async outbox (polling-based)
 * await outbox.send(compensationCommand)
 * ```
 *
 * ### Horizontal Scaling with Partition Keys
 *
 * Scale horizontally by partitioning messages:
 *
 * ```typescript
 * // Tenant 1 consumer
 * const tenant1Outbox = createOutboxConsumer({
 *   // ...
 *   consumerName: 'my-service',
 *   partitionKey: 'tenant-1'
 * })
 *
 * // Tenant 2 consumer
 * const tenant2Outbox = createOutboxConsumer({
 *   // ...
 *   consumerName: 'my-service',
 *   partitionKey: 'tenant-2'
 * })
 * ```
 *
 * ## Architecture
 *
 * Hermes PostgreSQL leverages PostgreSQL's built-in Logical Replication:
 *
 * 1. **Application** queues messages in the outbox table within transactions
 * 2. **PostgreSQL WAL** ensures durability even if the app crashes
 * 3. **Logical Replication** streams changes to Hermes in real-time
 * 4. **Hermes** invokes your `publish` callback for each message
 * 5. **Acknowledgment** happens only after successful callback completion
 *
 * ## Error Handling
 *
 * ```typescript
 * import { HermesConsumerAlreadyTakenError } from '@arturwojnar/hermes-postgresql'
 *
 * try {
 *   await outbox.start()
 * } catch (error) {
 *   if (error instanceof HermesConsumerAlreadyTakenError) {
 *     console.error('Consumer already running, use different partition key')
 *   }
 * }
 * ```
 *
 * ## Best Practices
 *
 * 1. **Always use transactions** - Queue events in the same transaction as business logic
 * 2. **Make handlers idempotent** - Messages may be delivered more than once
 * 3. **Use deterministic message IDs** - Same logical message should have same ID
 * 4. **Monitor WAL retention** - Slow consumers can cause WAL to grow
 * 5. **Use async outbox for compensations** - Keep WAL clean for critical events
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/arturwojnar/hermes)
 * - [Documentation](https://docs.hermesjs.tech)
 * - [Examples](https://github.com/arturwojnar/hermes/tree/main/examples/postgresql)
 *
 * @see {@link createOutboxConsumer} - Main entry point
 * @see {@link ConsumerCreationParams} - Configuration options
 * @see {@link HermesMessageEnvelope} - Message envelope structure
 * @see {@link useBasicAsyncOutboxConsumerPolicy} - Async outbox policy
 */

export {
  AsyncOutboxConsumer,
  createAsyncOutboxConsumer,
  type IAsyncOutboxConsumer,
} from './asyncOutbox/AsyncOutboxConsumer.js'
export { type ConsumerCreationParams } from './common/ConsumerCreationParams.js'
export { HermesConsumerAlreadyTakenError, HermesErrorCode } from './common/errors.js'
export {
  type ErrorCallback,
  type HermesMessageEnvelope,
  type HermesSql,
  type IOutboxConsumer,
  type MessageEnvelope,
  type NowFunction,
  type Publish,
  type PublishOptions,
  type Start,
  type Stop,
} from './common/types.js'
export { createOutboxConsumer } from './outbox/createOutboxConsumer.js'
export { OutboxConsumer } from './outbox/OutboxConsumer.js'
export { useBasicAsyncOutboxConsumerPolicy, type UseAsyncOutboxPolicy } from './policies/useBasicAsyncStoragePolicy.js'
