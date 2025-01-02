import postgres, { Options, PostgresType } from 'postgres'
import { ConsumerCreationParams } from '../common/ConsumerCreationParams.js'
import { OutboxConsumer } from './OutboxConsumer.js'

export const createOutboxConsumer = <Event>(params: ConsumerCreationParams<Event>): OutboxConsumer<Event> => {
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
