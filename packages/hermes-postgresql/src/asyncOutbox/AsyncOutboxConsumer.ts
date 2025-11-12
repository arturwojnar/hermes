import { Duration } from '@arturwojnar/hermes'
import { JSONValue, Sql, TransactionSql } from 'postgres'
import { AsyncOrSync } from 'ts-essentials'
import { HermesSql, MessageEnvelope, Stop } from '../common/types.js'

/**
 * Envelope for messages in the async outbox with processing metadata.
 *
 * @template Message - The type of the domain message/event
 * @internal
 */
type HermesAsyncMessageEnvelope<Message> = {
  /** Sequential position in the asyncOutbox table */
  position: number
  /** Unique message identifier */
  messageId: string
  /** Message type discriminator */
  messageType: string
  /** Number of delivery attempts */
  redeliveryCount: number
  /** The actual message data */
  message: Message
}

/**
 * Options for sending messages to the async outbox.
 * @internal
 */
type PublishOptions = {
  /** Optional transaction for atomic operations */
  tx?: TransactionSql
}

/**
 * Configuration parameters for creating an async outbox consumer.
 *
 * @template Message - The type of domain messages/events
 * @internal
 */
type ConsumerCreationParams<Message> = {
  /**
   * Getter function for the PostgreSQL connection.
   *
   * Returns a regular Postgres.js instance (not the streaming connection).
   *
   * @returns PostgreSQL connection with BigInt support
   */
  getSql: () => HermesSql

  /**
   * Callback invoked when a message is ready to be published.
   *
   * @param message - Single message or array of messages
   * @throws Error to trigger redelivery
   */
  publish: (
    message: HermesAsyncMessageEnvelope<Message> | HermesAsyncMessageEnvelope<Message>[],
  ) => AsyncOrSync<void> | never

  /**
   * Consumer name (used for isolation between consumers).
   */
  consumerName: string

  /**
   * Interval for polling the asyncOutbox table for new messages.
   *
   * The next polling cycle starts after the previous one completes.
   *
   * @defaultValue `Duration.ofSeconds(15)`
   */
  checkInterval?: Duration

  /**
   * Duration to wait after a failed publish attempt before retrying.
   *
   * @defaultValue `Duration.ofSeconds(1)`
   */
  waitAfterFailedPublish?: Duration

  /**
   * Whether to automatically stop on SIGTERM/SIGINT signals.
   *
   * @defaultValue `true`
   */
  shouldDisposeOnSigterm?: boolean

  /**
   * Callback invoked when publishing fails.
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
}

/**
 * Interface for the asynchronous outbox consumer.
 *
 * @template Message - The type of domain messages/events
 */
interface IAsyncOutboxConsumer<Message extends JSONValue> {
  /**
   * Sends a message or array of messages to the async outbox.
   *
   * @param message - Single message or array of messages
   * @param options - Optional transaction for atomic operations
   */
  send(message: MessageEnvelope<Message> | MessageEnvelope<Message>[], options: PublishOptions): Promise<void>

  /**
   * Starts the async outbox consumer polling loop.
   *
   * @returns Stop function for graceful shutdown
   */
  start(): Stop

  /**
   * Stops the async outbox consumer.
   */
  stop(): Promise<void>
}

/**
 * Asynchronous outbox consumer for non-critical messages.
 *
 * Unlike the main outbox (WAL-based via Logical Replication), the async outbox
 * uses polling and is suitable for:
 * - Compensation commands
 * - Notifications
 * - Cleanup operations
 * - Messages where delivery timing is flexible
 *
 * ## Key Differences from Main Outbox
 *
 * | Feature | Main Outbox | Async Outbox |
 * |---------|-------------|--------------|
 * | Mechanism | PostgreSQL Logical Replication | Polling |
 * | Message Loss Risk | Zero (WAL-based) | Low (DB-based) |
 * | Latency | Real-time streaming | Poll interval |
 * | WAL Impact | Yes (retention) | No |
 * | Use Case | Critical events | Non-critical messages |
 *
 * ## Usage
 *
 * The async outbox is typically created via {@link useBasicAsyncOutboxConsumerPolicy}
 * and accessed through the main outbox consumer's `send()` method.
 *
 * @template Message - The type of domain messages/events
 *
 * @example
 * ```typescript
 * // Created automatically via policy
 * const outbox = createOutboxConsumer({
 *   // ...
 *   asyncOutbox: useBasicAsyncOutboxConsumerPolicy()
 * })
 *
 * // Critical events → main outbox (WAL-based)
 * await outbox.queue(orderCreatedEvent, { tx: sql })
 *
 * // Compensations → async outbox (polling-based)
 * await outbox.send(revertPaymentCommand)
 * ```
 *
 * @see {@link useBasicAsyncOutboxConsumerPolicy} for creating instances
 * @see {@link IAsyncOutboxConsumer} for the interface
 */
class AsyncOutboxConsumer<Message extends JSONValue> implements IAsyncOutboxConsumer<Message> {
  private readonly _checkInterval: Duration
  private readonly _getSql: () => HermesSql

  private _started = false
  private _isProcessing = false
  private _intervalId: NodeJS.Timeout | null = null

  /**
   * @internal
   */
  constructor(private readonly _params: ConsumerCreationParams<Message>) {
    this._checkInterval = _params.checkInterval || Duration.ofSeconds(15)
    this._getSql = _params.getSql
  }

  /**
   * Sends a message or array of messages to the async outbox.
   *
   * Messages are stored in the `asyncOutbox` table and processed via polling.
   * Unlike `queue()`, this doesn't use PostgreSQL Logical Replication.
   *
   * **When to use:**
   * - Compensation commands
   * - Non-critical notifications
   * - Cleanup operations
   * - Messages where delivery timing is flexible
   *
   * @param message - Single message or array of messages to send
   * @param options - Optional transaction for atomic operations
   *
   * @throws {Error} If database connection is not established
   * @throws {Error} If message insertion fails
   *
   * @example
   * ```typescript
   * // Send single compensation command
   * await outbox.send({
   *   messageId: constructMessageId('RevertPayment', orderId),
   *   messageType: 'RevertPayment',
   *   message: { type: 'RevertPayment', data: { orderId } }
   * })
   *
   * // Send multiple messages atomically
   * await outbox.send([compensationCmd1, compensationCmd2])
   *
   * // Send within a transaction
   * await sql.begin(async (sql) => {
   *   await updateSomething(sql)
   *   await outbox.send(compensationCmd, { tx: sql })
   * })
   * ```
   */
  async send(message: MessageEnvelope<Message> | MessageEnvelope<Message>[], options?: PublishOptions): Promise<void> {
    if (!this._getSql()) {
      throw new Error('Database connection not established. Call start() first.')
    }

    const sql = options?.tx || this._getSql()

    if (Array.isArray(message)) {
      if ('savepoint' in sql) {
        for (const m of message) {
          await this._publishOne(sql, m)
        }
      } else {
        await sql.begin(async (sql) => {
          for (const m of message) {
            await this._publishOne(sql, m)
          }
        })
      }
    } else {
      await this._publishOne(sql, message)
    }
  }

  /**
   * Starts the async outbox consumer polling loop.
   *
   * Begins polling the `asyncOutbox` table at the configured interval
   * for undelivered messages.
   *
   * @returns Stop function for graceful shutdown
   *
   * @throws {Error} If consumer is already started
   *
   * @example
   * ```typescript
   * const asyncOutbox = createAsyncOutboxConsumer({
   *   getSql: () => sql,
   *   publish: async (envelope) => {
   *     await handleMessage(envelope)
   *   },
   *   consumerName: 'my-service'
   * })
   *
   * const stop = asyncOutbox.start()
   *
   * // Later, stop gracefully
   * await stop()
   * ```
   */
  start() {
    if (this._started) {
      throw new Error(`AsyncOutboxConsumer is already started`)
    }

    this._started = true
    this._startPolling()

    return (() => Promise.resolve(stop())) as Stop
  }

  /**
   * Stops the async outbox consumer.
   *
   * Stops polling and waits for the current processing cycle to complete.
   * Does not wait for in-flight message handlers to finish.
   *
   * @example
   * ```typescript
   * await asyncOutbox.stop()
   * console.log('Async outbox consumer stopped')
   * ```
   */
  async stop(): Promise<void> {
    if (this._intervalId) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }

    this._started = false
  }

  private async _publishOne(sql: Sql, message: MessageEnvelope<Message>) {
    await sql`
      INSERT INTO "asyncOutbox" (
        "consumerName",
        "messageId",
        "messageType",
        "data"
      ) VALUES (
        ${this._params.consumerName},
        ${message.messageId},
        ${message.messageType},
        ${this._getSql().json(message.message)}
      )
    `
  }

  private _startPolling(): void {
    this._intervalId = setInterval(async () => {
      try {
        await this._processUndeliveredMessages()
      } catch (error) {
        // console.error('Error processing undelivered messages:', error)
      }
    }, this._checkInterval.ms)
  }

  private async _processUndeliveredMessages(): Promise<void> {
    if (this._isProcessing) {
      return
    }

    this._isProcessing = true
    try {
      const pendingMessages = await this._getSql()`
        SELECT * FROM "asyncOutbox"
        WHERE delivered = false
        ORDER BY "addedAt" ASC
        LIMIT 10
      `

      for (const message of pendingMessages) {
        try {
          await this._params.publish({
            position: message.position,
            messageId: message.messageId,
            messageType: message.messageType,
            message: message.data,
            redeliveryCount: message.failsCount || 0,
          })

          await this._getSql()`
            UPDATE "asyncOutbox"
            SET "delivered" = true,
                "sentAt" = NOW()
            WHERE "position" = ${message.position}
          `
        } catch (error) {
          await this._getSql()`
            UPDATE "asyncOutbox"
            SET "failsCount" = COALESCE("failsCount", 0) + 1
            WHERE "position" = ${message.position}
          `
        }
      }
    } finally {
      this._isProcessing = false
    }
  }
}

const createAsyncOutboxConsumer = <Message extends JSONValue>(params: ConsumerCreationParams<Message>) =>
  new AsyncOutboxConsumer<Message>(params)

export {
  AsyncOutboxConsumer,
  createAsyncOutboxConsumer,
  IAsyncOutboxConsumer,
  type ConsumerCreationParams,
  type HermesAsyncMessageEnvelope,
}
