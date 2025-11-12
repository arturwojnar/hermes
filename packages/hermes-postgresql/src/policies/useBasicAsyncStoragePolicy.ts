import { Duration, literalObject } from '@arturwojnar/hermes'
import { JSONValue } from 'postgres'
import {
  createAsyncOutboxConsumer,
  HermesAsyncMessageEnvelope,
  IAsyncOutboxConsumer,
} from '../asyncOutbox/AsyncOutboxConsumer.js'
import { HermesMessageEnvelope } from '../common/types.js'
import { OutboxConsumer } from '../outbox/OutboxConsumer.js'

/**
 * Policy function type that creates an async outbox consumer.
 *
 * This type defines a function that takes a parent {@link OutboxConsumer} and
 * returns an {@link IAsyncOutboxConsumer} configured to work with it.
 *
 * @template Message - The type of domain messages/events
 *
 * @param hermes - The parent outbox consumer instance
 * @returns Configured async outbox consumer
 *
 * @example
 * ```typescript
 * // Custom policy implementation
 * const myAsyncPolicy: UseAsyncOutboxPolicy<DomainEvent> = (hermes) => {
 *   return createAsyncOutboxConsumer({
 *     consumerName: hermes.getCreationParams().consumerName,
 *     getSql: () => hermes.getDbConnection(),
 *     publish: async (envelope) => {
 *       // Custom publishing logic
 *       await myCustomHandler(envelope)
 *     },
 *     checkInterval: Duration.ofSeconds(30)
 *   })
 * }
 * ```
 */
type UseAsyncOutboxPolicy<Message extends JSONValue> = (
  hermes: OutboxConsumer<Message>,
) => IAsyncOutboxConsumer<Message>

/**
 * Creates a basic async outbox consumer policy.
 *
 * The async outbox is a secondary message queue for non-critical messages
 * that don't require the guarantees of PostgreSQL Logical Replication.
 * It uses polling instead of WAL streaming.
 *
 * ## When to Use Async Outbox
 *
 * - **Compensation commands** - Reverting partial failures
 * - **Non-critical notifications** - Emails, SMS, push notifications
 * - **Cleanup operations** - Removing temp files, clearing caches
 * - **Audit logs** - Historical records that can tolerate delays
 * - **Analytics events** - Metrics and tracking data
 *
 * ## Benefits Over Main Outbox
 *
 * - **No WAL retention** - Doesn't occupy PostgreSQL WAL space
 * - **Independent processing** - Failures don't block critical events
 * - **Lower priority** - Doesn't compete with critical message processing
 * - **Flexible timing** - Poll interval can be adjusted
 *
 * @param checkInterval - How often to poll for new messages (default: 15 seconds)
 *
 * @returns A policy function that creates an async outbox consumer
 *
 * @example
 * ### Basic Usage
 * ```typescript
 * import {
 *   createOutboxConsumer,
 *   useBasicAsyncOutboxConsumerPolicy
 * } from '@arturwojnar/hermes-postgresql'
 *
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   getOptions: () => ({ host: 'localhost', port: 5432, ... }),
 *   publish: async (envelope) => {
 *     await messageBroker.publish(envelope.message)
 *   },
 *   consumerName: 'my-service',
 *   asyncOutbox: useBasicAsyncOutboxConsumerPolicy()
 * })
 * ```
 *
 * @example
 * ### Custom Poll Interval
 * ```typescript
 * // Poll every 30 seconds instead of default 15
 * asyncOutbox: useBasicAsyncOutboxConsumerPolicy(Duration.ofSeconds(30))
 * ```
 *
 * @example
 * ### Using Both Outboxes
 * ```typescript
 * // Critical event - use main outbox (WAL-based, guaranteed delivery)
 * await sql.begin(async (sql) => {
 *   await db.createOrder(order, sql)
 *   await outbox.queue({
 *     messageId: constructMessageId('OrderCreated', order.id),
 *     messageType: 'OrderCreated',
 *     message: { type: 'OrderCreated', data: order }
 *   }, { tx: sql })
 * })
 *
 * // Non-critical notification - use async outbox (polling-based)
 * await outbox.send({
 *   messageId: constructMessageId('SendWelcomeEmail', user.id),
 *   messageType: 'SendWelcomeEmail',
 *   message: { type: 'SendWelcomeEmail', data: { userId: user.id } }
 * })
 * ```
 *
 * @example
 * ### Compensation Commands
 * ```typescript
 * // Main flow uses WAL-based outbox
 * try {
 *   const subject = await addUserToIdP(email)
 *   await storePatient(patientId, subject, sql)
 *   await outbox.queue(patientRegisteredEvent, { tx: sql })
 * } catch (error) {
 *   // Compensation uses async outbox
 *   await outbox.send({
 *     messageId: constructMessageId('RevertRegistration', patientId),
 *     messageType: 'RevertRegistration',
 *     message: {
 *       type: 'RevertRegistration',
 *       data: { patientId, subject }
 *     }
 *   })
 * }
 * ```
 *
 * @see {@link UseAsyncOutboxPolicy} for the policy type
 * @see {@link IAsyncOutboxConsumer} for the async consumer interface
 * @see {@link AsyncOutboxConsumer} for implementation details
 */
const useBasicAsyncOutboxConsumerPolicy =
  (checkInterval = Duration.ofSeconds(15)) =>
  <Message extends JSONValue>(hermes: OutboxConsumer<Message>) => {
    const params = hermes.getCreationParams()

    return createAsyncOutboxConsumer<Message>({
      consumerName: params.consumerName,
      getSql: () => hermes.getDbConnection(),
      publish: (message) => params.publish(toHermesEnvelope<Message>(message)),
      checkInterval,
    })
  }

/**
 * @internal
 * Converts async outbox envelopes to standard Hermes envelopes.
 */
const toHermesEnvelope = <Message extends JSONValue>(
  message: HermesAsyncMessageEnvelope<Message> | HermesAsyncMessageEnvelope<Message>[],
) => {
  if (Array.isArray(message)) {
    return message.map<HermesMessageEnvelope<Message>>((message) => ({
      ...message,
      lsn: `0/0`,
    }))
  } else {
    return literalObject<HermesMessageEnvelope<Message>>({ ...message, lsn: `0/0` })
  }
}

export { useBasicAsyncOutboxConsumerPolicy, type UseAsyncOutboxPolicy }
