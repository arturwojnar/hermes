import postgres, { JSONValue, Options, PostgresType } from 'postgres'
import { ConsumerCreationParams } from '../common/ConsumerCreationParams.js'
import { OutboxConsumer } from './OutboxConsumer.js'

/**
 * Creates a new outbox consumer instance for PostgreSQL.
 *
 * This is the main entry point for using Hermes PostgreSQL. It creates a consumer
 * that leverages PostgreSQL Logical Replication to implement the Outbox Pattern,
 * ensuring reliable at-least-once message delivery with zero message loss.
 *
 * ## How It Works
 *
 * 1. **Queue messages** in the outbox table within your transactions
 * 2. **PostgreSQL WAL** ensures durability even if the app crashes
 * 3. **Logical Replication** streams changes to Hermes in real-time
 * 4. **Hermes invokes** your `publish` callback for each message
 * 5. **Acknowledgment** happens only after successful callback completion
 *
 * @template Message - The type of domain messages/events this consumer will handle
 *
 * @param params - Configuration parameters including database connection, publish callback, and consumer settings
 *
 * @returns An {@link OutboxConsumer} instance ready to start consuming messages
 *
 * @throws {HermesConsumerAlreadyTakenError} If a consumer with the same name and partition key is already running
 *
 * @example
 * ### Basic Setup
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
 *     await messageBroker.publish(envelope.message)
 *   },
 *   consumerName: 'my-service'
 * })
 *
 * // Start consuming messages
 * const stop = await outbox.start()
 * ```
 *
 * @example
 * ### Transactional Event Publishing
 * ```typescript
 * // Queue message atomically with business logic
 * await sql.begin(async (sql) => {
 *   // Business operation
 *   await db.collection('patients').insertOne(patient, sql)
 *
 *   // Event publishing - same transaction!
 *   await outbox.queue({
 *     messageId: constructMessageId('PatientRegistered', patient.id),
 *     messageType: 'PatientRegistered',
 *     message: {
 *       type: 'PatientRegistered',
 *       data: { patientId: patient.id }
 *     }
 *   }, { tx: sql })
 * })
 * // Either both succeed or both fail - no inconsistency possible
 * ```
 *
 * @example
 * ### With Async Outbox for Compensations
 * ```typescript
 * import { useBasicAsyncOutboxConsumerPolicy } from '@arturwojnar/hermes-postgresql'
 *
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   // ... other options
 *   asyncOutbox: useBasicAsyncOutboxConsumerPolicy(Duration.ofSeconds(30))
 * })
 *
 * // Critical events use main outbox (WAL-based, zero message loss)
 * await outbox.queue(criticalEvent, { tx: sql })
 *
 * // Compensations use async outbox (polling-based, eventual delivery)
 * await outbox.send(compensationCommand)
 * ```
 *
 * @example
 * ### Horizontal Scaling with Partition Keys
 * ```typescript
 * // Tenant 1 consumer
 * const tenant1Outbox = createOutboxConsumer({
 *   // ...
 *   consumerName: 'order-service',
 *   partitionKey: 'tenant-abc'
 * })
 *
 * // Tenant 2 consumer (different partition, same consumer name)
 * const tenant2Outbox = createOutboxConsumer({
 *   // ...
 *   consumerName: 'order-service',
 *   partitionKey: 'tenant-xyz'
 * })
 * ```
 *
 * @example
 * ### Graceful Shutdown
 * ```typescript
 * const stopOutbox = await outbox.start()
 *
 * process.on('SIGTERM', async () => {
 *   console.log('Shutting down gracefully...')
 *   await stopOutbox() // Waits for in-flight messages
 *   await closeOtherResources()
 *   process.exit(0)
 * })
 * ```
 *
 * @see {@link ConsumerCreationParams} for all configuration options
 * @see {@link OutboxConsumer} for the consumer API
 * @see {@link HermesMessageEnvelope} for the message envelope structure
 * @see {@link MessageEnvelope} for queueing messages
 */
export const createOutboxConsumer = <Message extends JSONValue>(
  params: ConsumerCreationParams<Message>,
): OutboxConsumer<Message> => {
  return new OutboxConsumer(params, (options: Options<Record<string, PostgresType>>) =>
    postgres({
      ...options,
      types: {
        ...options?.types,
        bigint: postgres.BigInt,
      },
    }),
  )
}
