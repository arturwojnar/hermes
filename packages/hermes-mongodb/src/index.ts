/**
 * @packageDocumentation
 *
 * # Hermes MongoDB
 *
 * Production-ready implementation of the Outbox Pattern for MongoDB using Change Streams.
 *
 * ## Features
 *
 * - ✅ **At-least-once delivery** guaranteed by MongoDB oplog
 * - ✅ **Real-time streaming** via Change Streams (no polling)
 * - ✅ **Transactional consistency** between data and events
 * - ✅ **Horizontal scaling** with partition keys
 * - ✅ **Replica set support** (MongoDB 4.0+)
 *
 * ## Installation
 *
 * ```bash
 * npm install @arturwojnar/hermes @arturwojnar/hermes-mongodb
 * ```
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createOutboxConsumer } from '@arturwojnar/hermes-mongodb'
 * import { MongoClient } from 'mongodb'
 *
 * type DomainEvent =
 *   | { type: 'MedicineAssigned'; patientId: string; medicineId: string }
 *   | { type: 'TaskCompleted'; taskId: string }
 *
 * const client = new MongoClient('mongodb://localhost:27017')
 * await client.connect()
 *
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   client,
 *   db: client.db('hospital'),
 *   publish: async (event) => {
 *     // Publish to your message broker
 *     await messageBroker.publish(event)
 *   }
 * })
 *
 * // Start consuming
 * const stop = await outbox.start()
 *
 * // Publish events with transactional consistency
 * await outbox.publish(event, async (session, db) => {
 *   await db.collection('patients').insertOne({ ... }, { session })
 * })
 * ```
 *
 * ## Key Concepts
 *
 * ### Transactional Event Publishing
 *
 * Ensure events are only published if data operations succeed:
 *
 * ```typescript
 * await outbox.publish(medicineAssignedEvent, async (session, db) => {
 *   // Business logic in same transaction
 *   await db.collection('assignments').insertOne(assignment, { session })
 * })
 * // Either both succeed or both fail - no inconsistency possible
 * ```
 *
 * ### At-Least-Once Delivery
 *
 * Hermes guarantees delivery via the publish callback:
 *
 * ```typescript
 * publish: async (event) => {
 *   // ✅ Success: Event acknowledged, won't redeliver
 *   await broker.publish(event)
 *
 *   // ❌ Throws: Event not acknowledged, will retry
 *   throw new Error('Broker unavailable')
 * }
 * ```
 *
 * ### Idempotent Handlers
 *
 * Since events may be delivered multiple times, handlers must be idempotent:
 *
 * ```typescript
 * publish: async (event) => {
 *   // Check if already processed using event data
 *   const eventId = `${event.type}-${event.patientId}`
 *   if (await isProcessed(eventId)) {
 *     return // Safe to skip
 *   }
 *
 *   await handleEvent(event)
 *   await markProcessed(eventId)
 * }
 * ```
 *
 * ### MongoDB Configuration
 *
 * Change Streams require a MongoDB replica set:
 *
 * ```ini
 * # mongod.conf
 * replication:
 *   replSetName: "rs0"
 * ```
 *
 * Initialize replica set:
 * ```bash
 * mongosh --eval "rs.initiate()"
 * ```
 *
 * ## Important: Oplog vs WAL
 *
 * ⚠️ **Key Difference from PostgreSQL**: MongoDB's oplog has limited retention (typically hours),
 * unlike PostgreSQL WAL which is retained until acknowledged. This means:
 *
 * - **Slow consumers risk data loss** - If consumer is down longer than oplog retention
 * - **Monitor oplog size** - Check `rs.printReplicationInfo()` for retention window
 * - **Fast recovery required** - Restart consumers quickly to avoid missing events
 *
 * ## Architecture
 *
 * Hermes MongoDB leverages MongoDB Change Streams:
 *
 * 1. **Application** publishes events to the outbox collection within transactions
 * 2. **MongoDB oplog** captures changes durably (within retention window)
 * 3. **Change Streams** streams changes to Hermes in real-time
 * 4. **Hermes** invokes your `publish` callback for each event
 * 5. **Acknowledgment** happens only after successful callback completion
 *
 * ## Advanced Features
 *
 * ### WithScope for Multiple Events
 *
 * Batch multiple event publishes in a single transaction:
 *
 * ```typescript
 * await outbox.withScope(async ({ publish, session }) => {
 *   // All events in same transaction
 *   await publish(event1)
 *   await publish(event2)
 *   await publish(event3)
 * })
 * ```
 *
 * ### Horizontal Scaling with Partition Keys
 *
 * Scale horizontally by partitioning events:
 *
 * ```typescript
 * // Tenant 1 consumer
 * const tenant1Outbox = createOutboxConsumer({
 *   // ...
 *   partitionKey: 'tenant-1'
 * })
 *
 * // Tenant 2 consumer
 * const tenant2Outbox = createOutboxConsumer({
 *   // ...
 *   partitionKey: 'tenant-2'
 * })
 * ```
 *
 * ## Best Practices
 *
 * 1. **Always use transactions** - Publish events in same transaction as business logic
 * 2. **Make handlers idempotent** - Events may be delivered more than once
 * 3. **Use discriminated unions** - Type your events with a `type` discriminator
 * 4. **Monitor oplog retention** - Ensure consumers restart within retention window
 * 5. **Use replica sets** - Change Streams require replica set configuration
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/arturwojnar/hermes)
 * - [Documentation](https://docs.hermesjs.tech)
 * - [MongoDB Change Streams](https://www.mongodb.com/docs/manual/changeStreams/)
 *
 * @see {@link createOutboxConsumer} - Main entry point
 * @see {@link ConsumerCreationParams} - Configuration options
 * @see {@link OutboxConsumer} - Consumer interface
 */

export { createOutboxConsumer } from './outbox.js'
export {
  type ConsumerCreationParams,
  type ErrorCallback,
  type NowFunction,
  type OutboxConsumer,
  type OutboxConsumerModel,
  type OutboxEvent,
  type OutboxMessageModel,
  type OutboxMessageStream,
  type OutboxScope,
  type Publish,
  type SaveWithEventCallback,
  type Start,
  type Stop,
  type WithScope,
} from './typings.js'
