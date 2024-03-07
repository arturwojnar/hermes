import { addDisposeOnSigterm, swallow } from '@arturwojnar/hermes'
import { createOutboxConsumer } from '@arturwojnar/hermes-mongodb'
import { MongoClient, ObjectId } from 'mongodb'
import { setTimeout } from 'node:timers/promises'
import { Client } from 'pulsar-client'
import { PulsarMutex } from './pulsar-mutex'

type DomainEvent<Name extends string, Data> = Readonly<{
  name: Name
  data: Data
}>
type MedicineAssigned = DomainEvent<
  'MedicineAssigned',
  {
    medicineId: string
    patientId: string
  }
>
type MedicineFinished = DomainEvent<
  'MedicineFinished',
  {
    medicineId: string
    patientId: string
  }
>
type MedicineEvent = MedicineAssigned | MedicineFinished

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
    const stop = await outbox.start()

    addDisposeOnSigterm(async () => {
      await stop()
    })
    //
    ;(async () => {
      while (true) {
        const medicineId = new ObjectId().toString()
        const patientId = new ObjectId().toString()
        try {
          await outbox.publish({
            name: 'MedicineAssigned',
            data: {
              medicineId,
              patientId,
            },
          })
        } catch {
          await setTimeout(1000)
          continue
        }
        console.info(`Event published for medicine ${medicineId} nad patient ${patientId}.`)
        await setTimeout(1000)
      }
    })()
    //
    ;(async () => {
      while (true) {
        try {
          const message = await subscription.receive()
          const event = JSON.parse(message.getData().toString('utf-8'))

          console.info(`Consumed event for medicine ${event.data.medicineId} and patient ${event.data.patientId}`)
        } catch {
          await setTimeout(1000)
        }
      }
    })()
  } catch (error) {
    console.error(error)
    throw error
  }
}

start()
