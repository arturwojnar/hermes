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

const PublicationName = `outbox_pub`
const SlotName = `outbox_slot`

export const migrate = async (sql: Sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS outbox (
      position    BIGSERIAL     PRIMARY KEY,
      event_type  VARCHAR(250)  NOT NULL,
      data        JSONB         NOT NULL
    );
  `

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
          SELECT * FROM INTO slot_created pg_create_logical_replication_slot('${SlotName}', 'pgoutput');
      END IF;
    END $$;
  `)
}

export const createOutboxConsumer = <Event>(
  params: ConsumerCreationParams<Event>,
  // createClient: (options: Options<Record<string, PostgresType>>) => Sql,
): OutboxConsumer<Event> => {
  return new OutboxConsumer(params, (options: Options<Record<string, PostgresType>>) => postgres(options))
}
export class OutboxConsumer<Event> implements IOutboxConsumer<Event> {
  private _sql: Sql | null = null

  constructor(
    private readonly _params: ConsumerCreationParams<Event>,
    private readonly _createClient: (options: Options<Record<string, PostgresType>>) => Sql,
  ) {}

  getDbConnection() {
    assert(this._sql, `A connection hasn't been yet established.`)
    return this._sql
  }

  async start(): Promise<Stop> {
    const { publish, getOptions } = this._params

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
    >`SELECT * FROM pg_replication_slots WHERE slot_name = 'outbox_slot';`
    const restartLsn = restartLsnResults?.[0]?.restart_lsn || '0/00000000'
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
      lastProcessedLsn: restartLsn,
      timestamp: new Date(),
      publication: PublicationName,
      slotName: SlotName,
    }
    startLogicalReplication(replicationState, subscribeSql, this.publish as any).catch((error) => {
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
  })

  const stop = await hermes.start()
  const sql = hermes.getDbConnection()

  process.on('SIGTERM', () => {
    stop().catch(console.error)
  })

  const i = 0

  // while (++i) {
  //   await setTimeout(Duration.ofSeconds(5).ms)
  const json = { name: 'AddTest', i }
  await sql`INSERT INTO outbox (event_type, data) VALUES('AddTest-${sql(i.toString())}', ${sql.json(json)})`
  // }
}

;(async () => {
  await test()
})().catch((error) => {
  console.error(error)
})
