// import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts.js'
import { Duration } from '@arturwojnar/hermes'
import { describe, expect, jest, test } from '@jest/globals'
import { HermesConsumerAlreadyTakenError } from '../src/common/errors.js'
import { createOutboxConsumer, HermesMessageEnvelope } from '../src/index.js'
import { MedicineEvent } from './events.js'
import { postgres } from './postgresql.js'

jest.setTimeout(Duration.ofMinutes(5).ms)

describe(`Hermes consumer keeps its instance exclusively, so no two consumers of the same name can work at the same time`, () => {
  test('it works', async () => {
    await postgres(async (sql, container, onDispose) => {
      const publishEventStub = jest
        .fn<(message: HermesMessageEnvelope<MedicineEvent> | HermesMessageEnvelope<MedicineEvent>[]) => Promise<void>>()
        .mockResolvedValue()
      const outbox1 = createOutboxConsumer<MedicineEvent>({
        getOptions() {
          return {
            host: container.getHost(),
            port: container.getPort(),
            username: container.getUsername(),
            password: container.getPassword(),
            database: container.getDatabase(),
          }
        },
        publish: publishEventStub as any,
        consumerName: 'app1',
        serialization: false,
      })
      const stop = await outbox1.start()
      onDispose(stop)

      try {
        await createOutboxConsumer<MedicineEvent>({
          getOptions() {
            return {
              host: container.getHost(),
              port: container.getPort(),
              username: container.getUsername(),
              password: container.getPassword(),
              database: container.getDatabase(),
            }
          },
          publish: publishEventStub as any,
          consumerName: 'app1',
          serialization: false,
        }).start()

        expect('').toBe(`should throw an error`)
      } catch (error) {
        expect(error).toEqual(new HermesConsumerAlreadyTakenError({ consumerName: 'app1', partitionKey: 'default' }))
      }

      const outbox2 = await createOutboxConsumer<MedicineEvent>({
        getOptions() {
          return {
            host: container.getHost(),
            port: container.getPort(),
            username: container.getUsername(),
            password: container.getPassword(),
            database: container.getDatabase(),
          }
        },
        publish: publishEventStub as any,
        consumerName: 'app2',
        serialization: false,
      })
      const stop2 = await outbox2.start()
      onDispose(stop2)
    })
  })
})
