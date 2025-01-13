import { Duration, swallow } from '@arturwojnar/hermes'
import assert from 'assert'
import { JSONValue, Options, PostgresType, Sql } from 'postgres'
import { PublicationName, SlotName } from '../common/consts.js'
import { ConsumerCreationParams } from '../common/ConsumerCreationParams.js'
import { Lsn } from '../common/lsn.js'
import {
  HermesMessageEnvelope,
  HermesSql,
  InsertResult,
  IOutboxConsumer,
  MessageEnvelope,
  PublishOptions,
  Stop,
} from '../common/types.js'
import { startLogicalReplication } from '../subscribeToReplicationSlot/logicalReplicationStream.js'
import { LogicalReplicationState } from '../subscribeToReplicationSlot/types.js'
import { migrate } from './migrate.js'
import { createPublishingQueue } from './publishingQueue.js'

export class OutboxConsumer<Message extends JSONValue> implements IOutboxConsumer<Message> {
  private _sql: HermesSql | null = null

  constructor(
    private readonly _params: ConsumerCreationParams<Message>,
    private readonly _createClient: (options: Options<Record<string, PostgresType>>) => HermesSql,
  ) {}

  getDbConnection() {
    assert(this._sql, `A connection hasn't been yet established.`)
    return this._sql
  }

  async start(): Promise<Stop> {
    const { publish, getOptions, consumerName } = this._params
    const partitionKey = this._params.partitionKey || 'default'
    const publishingQueue = createPublishingQueue<InsertResult>(async ({ transaction }) => {
      await sql.begin(async (sql) => {
        const messages = transaction.results.map<HermesMessageEnvelope<Message>>((result) => ({
          position: result.position,
          messageId: result.messageId,
          messageType: result.messageType,
          lsn: transaction.lsn,
          message: JSON.parse(result.payload) as Message,
        }))

        await publish(messages)

        await sql`
          UPDATE "outboxConsumer"
          SET "lastProcessedLsn"=${transaction.lsn}, "lastUpdatedAt"=NOW()
          WHERE "consumerName"=${consumerName}
        `
      })
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
        application_name: 'hermes-postgresql',
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

    await migrate(sql)

    const restartLsnResults = await sql<
      [{ restart_lsn: Lsn }]
    >`SELECT * FROM pg_replication_slots WHERE slot_name = 'hermes_slot';`
    const restartLsn = restartLsnResults?.[0]?.restart_lsn || '0/00000000'

    await sql`
      INSERT INTO "outboxConsumer" ("consumerName", "partitionKey", "lastProcessedLsn") VALUES (${consumerName}, ${partitionKey}, ${restartLsn})
      ON CONFLICT ("consumerName") DO NOTHING;
    `
    const [{ lastProcessedLsn }] = await sql`
        SELECT "lastProcessedLsn" FROM "outboxConsumer"
        WHERE "consumerName"=${consumerName} AND "partitionKey"=${partitionKey}
      `
    console.log(lastProcessedLsn)

    const replicationState: LogicalReplicationState = {
      lastProcessedLsn: lastProcessedLsn,
      timestamp: new Date(),
      publication: PublicationName,
      slotName: SlotName,
    }

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
        publishingQueue.queue({ transaction, acknowledge })
        await publishingQueue.publishMessages()
        // await sql.begin(async (sql) => {
        //   const messages = transaction.results.map<HermesMessageEnvelope<Message>>((result) => ({
        //     position: result.position,
        //     messageId: result.messageId,
        //     messageType: result.messageType,
        //     lsn: transaction.lsn,
        //     message: JSON.parse(result.payload) as Message,
        //   }))

        //   await publish(messages)
        //   await sql`UPDATE "outboxConsumer" SET "lastProcessedLsn"=${transaction.lsn}, "lastUpdatedAt"=NOW() WHERE "consumerName"=${consumerName}`
        // })
      },
    })

    // addDisposeOnSigterm(() => dropReplicationSlot(sql, 'hermes_slot'))

    return async () => {
      await swallow(() => sql.end({ timeout: Duration.ofSeconds(5).ms }))
      // await swallow(() => subscribeSql.end({ timeout: Duration.ofSeconds(5).ms }))
    }
  }

  async publish(
    message: MessageEnvelope<Message> | MessageEnvelope<Message>[],
    options?: PublishOptions,
  ): Promise<void> {
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

  private async _publishOne(sql: Sql, message: MessageEnvelope<Message>, partitionKey = 'default') {
    await sql`INSERT INTO outbox ("messageId", "messageType", "partitionKey", "data") VALUES(${message.messageId}, ${message.messageType}, ${partitionKey}, ${sql.json(message.message)})`
  }
}
