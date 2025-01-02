import { Options, PostgresType } from 'postgres'
import { AsyncOrSync } from 'ts-essentials'
import { HermesMessageEnvelope, NowFunction } from './types.js'

type ConsumerCreationParams<Message> = {
  getOptions: () => Options<Record<string, PostgresType>>
  // db: Db
  publish: (message: HermesMessageEnvelope<Message> | HermesMessageEnvelope<Message>[]) => AsyncOrSync<void> | never
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

export type { ConsumerCreationParams }
