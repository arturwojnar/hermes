import { assert, Duration, swallow } from '@arturwojnar/hermes'
import { setTimeout } from 'node:timers/promises'
import postgres, { JSONValue, Options, PostgresType, Sql, TransactionSql } from 'postgres'
import { getSlotName, PublicationName } from '../common/consts.js'
import { ConsumerCreationParams } from '../common/ConsumerCreationParams.js'
import { ConsumerAlreadyTakenError } from '../common/errors.js'
import {
  HermesMessageEnvelope,
  HermesSql,
  InsertResult,
  IOutboxConsumer,
  MessageEnvelope,
  PublishOptions,
  Stop,
} from '../common/types.js'
import { createNonBlockingPublishingQueue } from '../publishingQueue/createNonBlockingPublishingQueue.js'
import {
  createSerializedPublishingQueue,
  MessageToPublish,
} from '../publishingQueue/createSerializedPublishingQueue.js'
import { startLogicalReplication } from '../subscribeToReplicationSlot/logicalReplicationStream.js'
import { LogicalReplicationState, Transaction } from '../subscribeToReplicationSlot/types.js'
import { killReplicationProcesses } from './killBackendReplicationProcesses.js'
import { migrate } from './migrate.js'
import { OutboxConsumerState, OutboxConsumerStore } from './OutboxConsumerState.js'

export class OutboxConsumer<Message extends JSONValue> implements IOutboxConsumer<Message> {
  private _sql: HermesSql | null = null
  private _sendAsync:
    | ((message: MessageEnvelope<Message> | MessageEnvelope<Message>[], tx?: TransactionSql) => Promise<void>)
    | null = null

  constructor(
    private readonly _params: ConsumerCreationParams<Message>,
    private readonly _createClient: (options: Options<Record<string, PostgresType>>) => HermesSql,
    private _state?: OutboxConsumerState,
  ) {}

  getCreationParams() {
    return this._params
  }

  getDbConnection() {
    assert(this._sql, `A connection hasn't been yet established.`)
    return this._sql
  }

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
      waitAfterFailedPublish: this._params.waitAfterFailedPublish || Duration.ofSeconds(1),
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
        throw new ConsumerAlreadyTakenError({ consumerName, partitionKey })
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
