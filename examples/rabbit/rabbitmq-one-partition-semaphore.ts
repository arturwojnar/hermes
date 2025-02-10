// import { OutboxConsumer, addDisposeOnSigterm } from '@outbox'
// import { addDisposeOnSigterm } from '@arturwojnar/hermes'
import { addDisposeOnSigterm } from '@arturwojnar/hermes'
// import { createOutboxConsumer } from '@arturwojnar/hermes-mongodb'
import { assert } from '@arturwojnar/hermes'
import amqp from 'amqplib'
import { MongoClient, ObjectId } from 'mongodb'
import { setTimeout } from 'node:timers/promises'
import { createOutboxConsumer } from '../../packages/hermes-mongodb/src/index'

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

// https://www.rabbitmq.com/blog/2014/02/19/distributed-semaphores-with-rabbitmq
async function setupSemaphore() {
  const conn = await amqp.connect('amqp://localhost')
  const channel = await conn.createChannel()
  const semaphoreQueue = 'resource.semaphore'
  await channel.assertQueue(semaphoreQueue, { durable: true })
  channel.sendToQueue(semaphoreQueue, Buffer.from('token'), { persistent: true })
  console.log('Semaphore setup complete.')
  await channel.close()
  await conn.close()
}
async function acquireSemaphore() {
  const conn = await amqp.connect('amqp://localhost')
  const channel = await conn.createChannel()
  const semaphoreQueue = 'resource.semaphore'

  await channel.assertQueue(semaphoreQueue, { durable: true })
  await channel.consume(
    semaphoreQueue,
    (msg) => {
      if (msg && msg.content.toString() === 'token') {
        console.log('Resource acquired')
        // Process the resource as needed. Do not acknowledge the message.

        // If you need to release the semaphore intentionally, you can reject the message back to the queue
        // channel.nack(msg, false, true);
      }
    },
    { noAck: false },
  )
}

const MONGODB_URI = `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true`
const QUEUE = `medicine`
const start = async () => {
  try {
    const client = new MongoClient(MONGODB_URI)
    const db = client.db('aid-kit')
    const connection = await amqp.connect(`amqp://localhost`)
    assert(connection)
    const channel = await connection.createChannel()
    assert(channel)
    channel.assertQueue(QUEUE)

    await client.connect()

    const outbox = createOutboxConsumer<MedicineEvent>({
      client,
      db,
      publish: async (event) => {
        assert(channel)
        try {
          channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(event)), { mandatory: true })
          return Promise.resolve()
        } catch {
          return Promise.reject()
        }
      },
    })

    const stop = await outbox.start()

    addDisposeOnSigterm(async () => {
      await stop()
      await client.close(true)
      await connection.close()
      await channel.close()
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
      const connection = await amqp.connect(`amqp://localhost:5672`)
      assert(connection)
      const channel = await connection.createChannel()
      assert(channel)
      channel.assertQueue(QUEUE)

      addDisposeOnSigterm(async () => {
        await connection.close()
        await channel.close()
      })

      while (true) {
        try {
          await channel.consume(QUEUE, (message) => {
            if (message) {
              const payload: MedicineEvent = JSON.parse(message.content.toString())
              console.info(
                `Consumed event for medicine ${payload.data.medicineId} and patient ${payload.data.patientId}`,
              )
              channel.ack(message)
            }
          })
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
