import postgres, { Options, PostgresType } from 'postgres'
import { ConsumerCreationParams } from '../common/ConsumerCreationParams.js'
import { OutboxConsumer } from './OutboxConsumer.js'

export const createOutboxConsumer = <Message>(params: ConsumerCreationParams<Message>): OutboxConsumer<Message> => {
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
