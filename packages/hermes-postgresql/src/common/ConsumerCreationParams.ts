import { Duration } from '@arturwojnar/hermes'
import { JSONValue, Options, PostgresType } from 'postgres'
import { AsyncOrSync } from 'ts-essentials'
import { UseAsyncOutboxPolicy } from '../policies/useBasicAsyncStoragePolicy.js'
import { HermesMessageEnvelope, NowFunction } from './types.js'

type ConsumerCreationParams<Message extends JSONValue> = {
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
   * @defaultValue Duration.ofSeconds(1)
   */
  waitAfterFailedPublish?: Duration
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
  /**
   * If you want to use a separate async outbox, pass a policy that creates it.
   */
  asyncOutbox?: UseAsyncOutboxPolicy<Message>
}

export type { ConsumerCreationParams }
