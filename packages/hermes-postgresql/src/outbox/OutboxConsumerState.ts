import { assert, literalObject } from '@arturwojnar/hermes'
import { TransactionSql } from 'postgres'
import { Prettify } from 'ts-essentials'
import { Lsn, toLsn } from '../common/lsn.js'
import { HermesSql } from '../common/types.js'

type BaseOutboxConsumerModel = {
  id: number
  consumerName: string
  partitionKey: string
  createdAt: Date
}
type InitialOutboxConsumerModel = {
  status: 'INITIAL'
}
type CreatedOutboxConsumerModel = Prettify<
  BaseOutboxConsumerModel & {
    status: 'CREATED'
    lastProcessedLsn: string
  }
>
type SuccessOutboxConsumerModel = Prettify<
  BaseOutboxConsumerModel & {
    status: 'SUCCESS_PUBLISH'
    lastProcessedLsn: string
    lastUpdatedAt: Date
  }
>
type RedeliverOutboxConsumerModel = Prettify<
  BaseOutboxConsumerModel & {
    status: 'FAILED_PUBLISH'
    failedNextLsn: string
    lastProcessedLsn: string
    nextLsnRedeliveryCount: number
    lastUpdatedAt: Date
  }
>
type DeletedOutboxConsumerModel = Prettify<
  BaseOutboxConsumerModel & {
    status: 'DELETED'
    deletedAt: Date
  }
>
type OutboxConsumerModel =
  | InitialOutboxConsumerModel
  | CreatedOutboxConsumerModel
  | SuccessOutboxConsumerModel
  | RedeliverOutboxConsumerModel
  | DeletedOutboxConsumerModel
type OutboxConsumerCreated = {
  id: number
  consumerName: string
  partitionKey: string
  createdAt: Date
  status: 'CREATED'
}
type OutboxConsumerMovedFurther = {
  status: 'SUCCESS_PUBLISH'
  lastProcessedLsn: string
  lastUpdatedAt: Date
  failedNextLsn: null
  nextLsnRedeliveryCount: 0
}
type OutboxConsumerReportedError = {
  status: 'FAILED_PUBLISH'
  failedNextLsn: string
  nextLsnRedeliveryCount: number
  lastUpdatedAt: Date
}
type OutboxConsumerDeleted = {
  status: 'DELETED'
  deletedAt: Date
}
type OutboxConsumerStatus = OutboxConsumerModel['status']
type Permutations<T, U = T> = [T] extends [never] ? [] : T extends T ? [T, ...Permutations<Exclude<U, T>>] : never
type UpdateParams = OutboxConsumerMovedFurther | OutboxConsumerReportedError | OutboxConsumerDeleted

const OutboxConsumerStatuses: Permutations<OutboxConsumerStatus> = [
  'INITIAL',
  'CREATED',
  'SUCCESS_PUBLISH',
  'FAILED_PUBLISH',
  'DELETED',
]

class OutboxConsumerStore {
  private _consumer: OutboxConsumerModel | null = null

  constructor(
    private readonly _sql: HermesSql,
    private readonly _consumerName: string,
    private readonly _partitionKey: string = 'default',
  ) {}

  async load() {
    const [consumer] = (await this._sql`
      SELECT "id", "lastProcessedLsn", "status", "failedNextLsn", "nextLsnRedeliveryCount", "createdAt", "lastUpdatedAt" FROM "outboxConsumer"
      WHERE "consumerName"=${this._consumerName}
        AND "partitionKey"=${this._partitionKey}
    `) as OutboxConsumerModel[]

    this._consumer = consumer

    return consumer
  }

  async createOrLoad(data: OutboxConsumerCreated) {
    const restartLsnResults = await this._sql<
      [{ restart_lsn: Lsn }]
    >`SELECT * FROM pg_replication_slots WHERE slot_name = 'hermes_slot';`
    const restartLsn = restartLsnResults?.[0]?.restart_lsn || '0/00000000'

    await this._sql`
      INSERT INTO "outboxConsumer" (
        "consumerName",
        "partitionKey",
        "lastProcessedLsn",
        "createdAt"
      ) VALUES (
        ${data.consumerName},
        ${data.partitionKey},
        ${restartLsn},
        ${data.createdAt}
      )
      ON CONFLICT ("consumerName") DO NOTHING;
    `

    return await this.load()
  }

  async update(consumerName: string, change: UpdateParams, tx?: TransactionSql) {
    assert(this._consumer)

    const skipKeys = ['id', 'createdAt', 'consumerName', 'partitionKey']
    const keys = Object.keys(change)
      .filter(([key]) => !skipKeys.includes(key))
      .map((key) => key as any as UpdateParams)

    if (keys.length === 0) {
      return this._consumer
    }

    const sql = tx ? (tx as unknown as HermesSql) : this._sql
    await sql`
      UPDATE "outboxConsumer"
      SET ${sql(change, ...(keys as any))}
      WHERE "consumerName" = ${consumerName};
    `

    Object.assign(this._consumer, change)

    return this._consumer
  }

  get consumer() {
    return this._consumer
  }

  get consumerName() {
    return this._consumerName
  }

  get lastProcessedLsn() {
    assert(this._consumer)

    const { status } = this._consumer

    if (status === 'INITIAL' || status === 'DELETED') {
      return toLsn('0/00000000')
    }

    return toLsn(this._consumer.lastProcessedLsn)
  }

  get redeliveryCount() {
    assert(this._consumer)

    const { status } = this._consumer

    if (status === 'FAILED_PUBLISH') {
      return this._consumer.nextLsnRedeliveryCount
    }

    return 0
  }
}

class OutboxConsumerState {
  constructor(private readonly _store: OutboxConsumerStore) {}

  async createOrLoad(partitionKey = 'default') {
    return await this._store.createOrLoad(
      literalObject<OutboxConsumerCreated>({
        status: 'CREATED',
        id: 0,
        consumerName: this._store.consumerName,
        partitionKey,
        createdAt: new Date(),
      }),
    )
  }

  async moveFurther(lastProcessedLsn: Lsn, tx?: TransactionSql) {
    const { consumer } = this._store

    assert(consumer)

    if (consumer.status === 'DELETED' || consumer.status === 'INITIAL') {
      return
    }

    await this._store.update(
      this._store.consumerName,
      literalObject<OutboxConsumerMovedFurther>({
        status: 'SUCCESS_PUBLISH',
        lastUpdatedAt: new Date(),
        lastProcessedLsn,
        failedNextLsn: null,
        nextLsnRedeliveryCount: 0,
      }),
      tx,
    )
  }

  async reportFailedDelivery(failedNextLsn: Lsn, tx?: TransactionSql) {
    const { consumer } = this._store

    assert(consumer)

    if (consumer.status === 'DELETED' || consumer.status === 'INITIAL') {
      return
    }

    const nextLsnRedeliveryCount =
      consumer.status === 'CREATED' || consumer.status === 'SUCCESS_PUBLISH' ? 1 : consumer.nextLsnRedeliveryCount + 1

    await this._store.update(
      this._store.consumerName,
      literalObject<OutboxConsumerReportedError>({
        status: 'FAILED_PUBLISH',
        lastUpdatedAt: new Date(),
        failedNextLsn,
        nextLsnRedeliveryCount,
      }),
      tx,
    )
  }

  get data() {
    return this._store.consumer
  }

  get lastProcessedLsn() {
    assert(this._store)

    return this._store.lastProcessedLsn
  }

  get redeliveryCount() {
    assert(this._store)

    return this._store.redeliveryCount
  }
}

export { OutboxConsumerState, OutboxConsumerStatuses, OutboxConsumerStore, type OutboxConsumerStatus }
