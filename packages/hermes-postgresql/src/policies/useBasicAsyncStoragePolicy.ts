import { Duration, literalObject } from '@arturwojnar/hermes'
import { JSONValue } from 'postgres'
import {
  createAsyncOutboxConsumer,
  HermesAsyncMessageEnvelope,
  IAsyncOutboxConsumer,
} from '../asyncOutbox/AsyncOutboxConsumer.js'
import { HermesMessageEnvelope } from '../common/types.js'
import { OutboxConsumer } from '../outbox/OutboxConsumer.js'

type UseAsyncOutboxPolicy<Message extends JSONValue> = (
  hermes: OutboxConsumer<Message>,
) => IAsyncOutboxConsumer<Message>

const useBasicAsyncOutboxConsumerPolicy =
  (checkInterval = Duration.ofSeconds(15)) =>
  <Message extends JSONValue>(hermes: OutboxConsumer<Message>) => {
    const params = hermes.getCreationParams()

    return createAsyncOutboxConsumer<Message>({
      consumerName: params.consumerName,
      getSql: () => hermes.getDbConnection(),
      publish: (message) => params.publish(toHermesEnvelope<Message>(message)),
      checkInterval,
    })
  }

const toHermesEnvelope = <Message extends JSONValue>(
  message: HermesAsyncMessageEnvelope<Message> | HermesAsyncMessageEnvelope<Message>[],
) => {
  if (Array.isArray(message)) {
    return message.map<HermesMessageEnvelope<Message>>((message) => ({
      ...message,
      lsn: `0/0`,
    }))
  } else {
    return literalObject<HermesMessageEnvelope<Message>>({ ...message, lsn: `0/0` })
  }
}

export { useBasicAsyncOutboxConsumerPolicy, type UseAsyncOutboxPolicy }
