import { Duration } from '@arturwojnar/hermes'
import { JSONValue, Options, PostgresType } from 'postgres'
import { AsyncOrSync } from 'ts-essentials'
import { UseAsyncOutboxPolicy } from '../policies/useBasicAsyncStoragePolicy.js'
import { PublishingQueue } from '../publishingQueue/publishingQueue.js'
import { HermesMessageEnvelope, NowFunction } from './types.js'

/**
 * Configuration parameters for creating an outbox consumer.
 *
 * @template Message - The type of domain messages/events this consumer will handle
 *
 * @example
 * ```typescript
 * const params: ConsumerCreationParams<DomainEvent> = {
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
 * }
 * ```
 */
type ConsumerCreationParams<Message extends JSONValue> = {
  /**
   * Function that returns PostgreSQL connection options.
   *
   * @returns Postgres.js connection options
   * @see {@link https://github.com/porsager/postgres#connection-parameters}
   */
  getOptions: () => Options<Record<string, PostgresType>>

  /**
   * Callback invoked when Hermes delivers a message.
   *
   * If this callback completes successfully, the message is acknowledged.
   * If it throws an error, the message will be retried.
   *
   * @param message - Single message or array of messages to publish
   * @throws Error to trigger redelivery
   */
  publish: (message: HermesMessageEnvelope<Message> | HermesMessageEnvelope<Message>[]) => AsyncOrSync<void> | never

  /**
   * Unique name for this consumer instance.
   *
   * Used to create a PostgreSQL replication slot.
   */
  consumerName: string

  /**
   * Partition key for horizontal scaling.
   *
   * @defaultValue `'default'`
   */
  partitionKey?: string

  /**
   * Duration to wait after a failed publish attempt before retrying.
   *
   * @defaultValue `Duration.ofSeconds(30)`
   */
  waitAfterFailedPublish?: Duration

  /**
   * Whether to automatically stop the consumer on SIGTERM/SIGINT signals.
   *
   * @defaultValue `true`
   */
  shouldDisposeOnSigterm?: boolean

  /**
   * Whether to save processing timestamps for each message.
   *
   * ⚠️ Use with caution: Significantly increases I/O operations.
   *
   * @defaultValue `false`
   */
  saveTimestamps?: boolean

  /**
   * Whether to process messages serially (one at a time) or concurrently.
   *
   * @defaultValue `false`
   */
  serialization?: boolean

  /**
   * Callback invoked when message publishing fails.
   *
   * @param error - The error that occurred
   * @defaultValue No-op function
   */
  onFailedPublish?: ErrorCallback

  /**
   * Callback invoked when a database error occurs.
   *
   * @param error - The database error
   * @defaultValue No-op function
   */
  onDbError?: ErrorCallback

  /**
   * Function that returns the current date/time.
   *
   * @returns Current date/time
   * @defaultValue `() => new Date()`
   */
  now?: NowFunction

  /**
   * Policy for configuring a separate async outbox consumer.
   *
   * The async outbox is used for non-critical messages like compensations.
   *
   * @see {@link useBasicAsyncOutboxConsumerPolicy}
   */
  asyncOutbox?: UseAsyncOutboxPolicy<Message>
}

export type { ConsumerCreationParams }
