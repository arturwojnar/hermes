import { Duration } from '@arturwojnar/hermes'
import { JSONValue, Sql, TransactionSql } from 'postgres'
import { AsyncOrSync } from 'ts-essentials'
import { HermesSql, MessageEnvelope, Stop } from '../common/types.js'

type HermesAsyncMessageEnvelope<Message> = {
  position: number
  messageId: string
  messageType: string
  redeliveryCount: number
  message: Message
}

type PublishOptions = {
  tx?: TransactionSql
}

type ConsumerCreationParams<Message> = {
  /**
   * Getter function of a PostgresJS regular instnace (not the streaming).
   *
   * @type {() => HermesSql}
   */
  getSql: () => HermesSql
  publish: (
    message: HermesAsyncMessageEnvelope<Message> | HermesAsyncMessageEnvelope<Message>[],
  ) => AsyncOrSync<void> | never
  /**
   * Consumer name.
   */
  consumerName: string
  /**
   * Interval of periodic checking of the messages for new ones.
   * The next interval execution will hapen when the previous messages' processing is completed.
   *
   * @default Duration.ofSeconds(15)
   * @type {Duration}
   */
  checkInterval?: Duration
  /**
   * @defaultValue Duration.ofSeconds(1)
   */
  waitAfterFailedPublish?: Duration
  /**
   * @defaultValue true
   */
  shouldDisposeOnSigterm?: boolean
  /**
   * @defaultValue `noop`
   */
  onFailedPublish?: ErrorCallback
  /**
   * @defaultValue `noop`
   */
  onDbError?: ErrorCallback
}

interface IAsyncOutboxConsumer<Message extends JSONValue> {
  send(message: MessageEnvelope<Message> | MessageEnvelope<Message>[], options: PublishOptions): Promise<void>
  start(): Stop
  stop(): Promise<void>
}

class AsyncOutboxConsumer<Message extends JSONValue> implements IAsyncOutboxConsumer<Message> {
  private readonly _checkInterval: Duration
  private readonly _getSql: () => HermesSql

  private _started = false
  private _isProcessing = false
  private _intervalId: NodeJS.Timeout | null = null

  constructor(private readonly _params: ConsumerCreationParams<Message>) {
    this._checkInterval = _params.checkInterval || Duration.ofSeconds(15)
    this._getSql = _params.getSql
  }

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

  start() {
    if (this._started) {
      throw new Error(`AsyncOutboxConsumer is already started`)
    }

    this._started = true
    this._startPolling()

    return (() => Promise.resolve(stop())) as Stop
  }

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
