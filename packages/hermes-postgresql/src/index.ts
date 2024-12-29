/* -eslint-disable  @typescript-eslint/no-unused-vars */
import { Duration } from '@arturwojnar/hermes'
import assert from 'assert'
import console from 'console'
import type { Options, PostgresType, Sql } from 'postgres'
import postgres from 'postgres'
import type { AsyncOrSync } from 'ts-essentials'
import type { Lsn } from './common/lsn.js'
import type { EventEnvelope } from './common/types.js'
import type { LogicalReplicationState } from './subscribeToReplicationSlot/logicalReplicationStream.js'
import { startLogicalReplication } from './subscribeToReplicationSlot/logicalReplicationStream.js'

type Start = () => Promise<Stop>
type Stop = () => Promise<void>
type Publish<Event> = (event: EventEnvelope<Event> | EventEnvelope<Event>[]) => Promise<void>
type IOutboxConsumer<Event> = {
  start: Start
  publish: Publish<Event>
  getDbConnection(): Sql
}
type NowFunction = () => Date
type ErrorCallback = (error: unknown) => void
type ConsumerCreationParams<Event> = {
  getOptions: () => Options<Record<string, PostgresType>>
  // db: Db
  publish: (event: Event) => AsyncOrSync<void> | never
  /**
   * Consumer name.
   */
  consumerName: string
  /**
   * @defaultValue `default`
   */
  partitionKey?: string
  /**
   * @defaultValue 1000
   */
  waitAfterFailedPublishMs?: number
  /**
   * @defaultValue true
   */
  shouldDisposeOnSigterm?: boolean
  /**
   * Use with consciously and carefully.
   * When `true`, Hermes will be affecting many documents, resulting in much more I/O operations.
   * @defaultValue false
   */
  saveTimestamps?: boolean
  /**
   * @defaultValue `noop`
   */
  onFailedPublish?: ErrorCallback
  /**
   * @defaultValue `noop`
   */
  onDbError?: ErrorCallback
  /**
   * @defaultValue `() => new Date()`
   */
  now?: NowFunction
}

const PublicationName = `hermes_pub`
const SlotName = `hermes_slot`

export const migrate = async (sql: Sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS "outbox" (
      "position"      BIGSERIAL     PRIMARY KEY,
      "messageId"     VARCHAR(250)  NOT NULL,
      "messageType"     VARCHAR(250)  NOT NULL,
      "partitionKey"  VARCHAR(50)   DEFAULT 'default' NOT NULL,
      "data"          JSONB         NOT NULL,
      "addedAt"       TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "createdAt"     TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "lsn"           VARCHAR(50)   NULL,
      "sentAt"        TIMESTAMPTZ   NULL
    );
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "outboxConsumer" (
      "id"                BIGSERIAL     PRIMARY KEY,
      "consumerName"      VARCHAR(30)   NOT NULL,
      "partitionKey"      VARCHAR(50)   DEFAULT 'default' NOT NULL,
      "lastProcessedLsn"  VARCHAR(20)   DEFAULT '0/00000000' NOT NULL,
      "createdAt"         TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "lastUpdatedAt"     TIMESTAMPTZ   DEFAULT NOW() NULL
    );
  `

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "consumerNameIdx" ON "outboxConsumer" ("consumerName" DESC);`
  await sql`CREATE INDEX IF NOT EXISTS "consumerNameAndPartKeyIdx" ON "outboxConsumer" ("consumerName" DESC, "partitionKey" NULLS LAST);`

  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = '${PublicationName}') THEN
        CREATE PUBLICATION ${PublicationName} FOR TABLE outbox;
      END IF;
    END $$;
  `)

  await sql.unsafe(`
    DO $$
    DECLARE
      slot_created boolean;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_replication_slots WHERE slot_name = '${SlotName}')
      THEN
          PERFORM pg_create_logical_replication_slot('${SlotName}', 'pgoutput');
          slot_created := true;
      END IF;

      RAISE NOTICE 'Slot created: %', slot_created;
    END $$;
  `)
}

export type HermesSql = Sql<{
  bigint: bigint
}>

export const createOutboxConsumer = <Event>(
  params: ConsumerCreationParams<Event>,
  // createClient: (options: Options<Record<string, PostgresType>>) => Sql,
): OutboxConsumer<Event> => {
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
    // const { unsubscribe } = await sql.subscribe(
    //   `insert:outbox`,
    //   (row, a) => {
    //     // { command, relation }
    //     // Callback function for each row change
    //     // tell about new event row over eg. websockets or do something else
    //     console.info(row)
    //     console.info(a)
    //     // await publish(row as any)
    //     // throw new Error()
    //   },
    //   () => {
    //     // Callback on initial connect and potential reconnects
    //     console.info('test')
    //   },
    // )
    const replicationState: LogicalReplicationState = {
      lastProcessedLsn: lastProcessedLsn,
      timestamp: new Date(),
      publication: PublicationName,
      slotName: SlotName,
    }
    startLogicalReplication({
      state: replicationState,
      sql: subscribeSql,
      publish: this.publish as any,
      onCommit: async (transaction) => {
        await sql.begin(async (sql) => {
          console.info(`updating ${transaction.lsn}`)
          await sql`UPDATE "outboxConsumer" SET "lastProcessedLsn"=${transaction.lsn}, "lastUpdatedAt"=NOW() WHERE "consumerName"=${consumerName}`
          // for (const result of transaction.results) {
          //   await sql`UPDATE outbox SET lsn=${transaction.lsn}, "sentAt"=NOW() WHERE position=${result.position}`
          // }
          console.info(`updated ${transaction.lsn}`)
        })
      },
    }).catch((error) => {
      console.error(error)
    })

    return async () => {
      // unsubscribe()
      await sql.end({ timeout: Duration.ofSeconds(5).ms })
    }
  }
  // Publish<Event> = (event: EventEnvelope<Event> | EventEnvelope<Event>[]) => Promise<void>
  async publish(event: EventEnvelope<Event> | EventEnvelope<Event>[]): Promise<void> {
    await Promise.resolve(event)
  }
}

const test = async () => {
  const hermes = createOutboxConsumer({
    getOptions() {
      return {
        host: 'localhost',
        port: 5434,
        database: 'hermes',
        user: 'hermes',
        password: 'hermes',
      }
    },
    publish: (event) => {
      return Promise.resolve()
    },
    consumerName: 'app',
  })

  const stop = await hermes.start()
  const sql = hermes.getDbConnection()

  process.on('SIGTERM', () => {
    stop().catch(console.error)
  })

  const i = 99999

  // while (++i) {
  //   await setTimeout(Duration.ofSeconds(5).ms)
  // const json = { name: 'AddTest', i }
  // const r =
  //   await sql`INSERT INTO outbox (messageType, data) VALUES('AddTest-${sql(i.toString())}', ${sql.json(json)}) RETURNING *`
  // console.log(r?.[0])
  // }
}

;(async () => {
  await test()
})().catch((error) => {
  console.error(error)
})
