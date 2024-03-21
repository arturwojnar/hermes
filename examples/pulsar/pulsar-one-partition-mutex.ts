import { createOutboxConsumer } from '../../packages/hermes-mongodb/src/outbox'
import { addDisposeOnSigterm } from '../../packages/hermes/src/addDisposeOnSigterm'
import { swallow } from '../../packages/hermes/src/utils'
import { MedicineEvent } from '../events'
import { MongoClient } from '../node_modules/mongodb/mongodb'
import { Client } from '../node_modules/pulsar-client/index'
import { doPublishing } from './do-publishing'
import { doReceiving } from './do-receiving'
import { PulsarMutex } from './pulsar-mutex'

const MONGODB_URI = `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true`
const PULSAR_URI = `pulsar://localhost:6650`

const start = async () => {
  const pulsarClient = new Client({ serviceUrl: PULSAR_URI })
  const mutex = new PulsarMutex(pulsarClient)
  const producer = await pulsarClient.createProducer({ topic: `public/default/events` })
  const subscription = await pulsarClient.subscribe({ topic: `public/default/events`, subscription: 'test' })

  addDisposeOnSigterm(async () => {
    await swallow(() => mutex.unlock())
    await swallow(() => subscription.close())
    await swallow(() => producer.close())
    await swallow(() => pulsarClient.close())
  })

  await mutex.lock()

  try {
    const client = new MongoClient(MONGODB_URI)
    const db = client.db('aid-kit')

    await client.connect()

    const outbox = createOutboxConsumer<MedicineEvent>({
      client,
      db,
      publish: async (event) => {
        // Normally, you should choose a corresponding topic for the given event.
        await producer.send({
          data: Buffer.from(JSON.stringify(event)),
        })
      },
    })

    // Hermes automatically registers the dispose on SIGTERM
    await outbox.start()

    doPublishing(outbox).catch(console.error)
    doReceiving(subscription).catch(console.error)
  } catch (error) {
    console.error(error)
    throw error
  }
}

start()
