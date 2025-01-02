import { Duration, swallow } from '@arturwojnar/hermes'
import assert from 'assert'
import { Options, PostgresType } from 'postgres'
import { PublicationName, SlotName } from '../common/consts.js'
import { ConsumerCreationParams } from '../common/ConsumerCreationParams.js'
import { Lsn } from '../common/lsn.js'
import { EventEnvelope, HermesSql, InsertResult, IOutboxConsumer, Stop } from '../common/types.js'
import { startLogicalReplication } from '../subscribeToReplicationSlot/logicalReplicationStream.js'
import { LogicalReplicationState } from '../subscribeToReplicationSlot/types.js'
import { migrate } from './migrate.js'

export class OutboxConsumer<Event> implements IOutboxConsumer<Event> {
  private _sql: HermesSql | null = null

  constructor(
    private readonly _params: ConsumerCreationParams<Event>,
    private readonly _createClient: (options: Options<Record<string, PostgresType>>) => HermesSql,
  ) {}

  getDbConnection() {
    assert(this._sql, `A connection hasn't been yet established.`)
    return this._sql
  }

  async start(): Promise<Stop> {
    const { publish, getOptions, consumerName } = this._params
    const partitionKey = this._params.partitionKey || 'default'

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
      // onclose: async function() {
      //   if (ended)
      //     return
      //   stream = null
      //   state.pid = state.secret = undefined
      //   connected(await init(sql, slot, options.publications))
      //   subscribers.forEach(event => event.forEach(({ onsubscribe }) => onsubscribe()))
      // },
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
    console.info(restartLsnResults?.[0])
    console.info(restartLsn)
    console.info(lastProcessedLsn)

    const replicationState: LogicalReplicationState = {
      lastProcessedLsn: lastProcessedLsn,
      timestamp: new Date(),
      publication: PublicationName,
      slotName: SlotName,
    }

    startLogicalReplication<InsertResult>({
      state: replicationState,
      sql: subscribeSql,
      columnConfig: {
        position: 'bigint',
        messageId: 'text',
        messageType: 'text',
        partitionKey: 'text',
        payload: 'jsonb',
      },
      onInserted: async (transaction) => {
        await sql.begin(async (sql) => {
          const messages = transaction.results.map<EventEnvelope<Event>>((result) => ({
            position: result.position,
            messageId: result.messageId,
            messageType: result.messageType,
            lsn: transaction.lsn,
            event: JSON.parse(result.payload) as Event,
          }))

          await publish(messages)
          await sql`UPDATE "outboxConsumer" SET "lastProcessedLsn"=${transaction.lsn}, "lastUpdatedAt"=NOW() WHERE "consumerName"=${consumerName}`
        })
      },
    }).catch((error) => {
      console.error(error)
    })

    return async () => {
      await swallow(() => sql.end({ timeout: Duration.ofSeconds(5).ms }))
      await swallow(() => subscribeSql.end({ timeout: Duration.ofSeconds(5).ms }))
    }
  }
  // Publish<Event> = (event: EventEnvelope<Event> | EventEnvelope<Event>[]) => Promise<void>
  async publish(event: EventEnvelope<Event> | EventEnvelope<Event>[]): Promise<void> {
    await Promise.resolve(event)
  }
}
