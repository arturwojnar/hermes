import { MongoClient } from 'mongodb'
import { setTimeout } from 'node:timers/promises'
import { OutboxConsumer } from './outbox'

type Event<Name extends string, Data> = Readonly<{
  name: Name
  data: Data
}>
type MedicineAdded = Event<
  'MedicineAdded',
  {
    medicineId: string
    patientId: string
  }
>
type MedicineRemoved = Event<
  'MedicineRemoved',
  {
    medicineId: string
    patientId: string
  }
>
type MedicineEvent = MedicineAdded | MedicineRemoved
;(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true')
  const db = client.db('test')
  const outbox = OutboxConsumer<MedicineEvent>({
    client,
    db,
    partitionKey: 'default',
    publishEvent: async (event) => {
      await setTimeout(100)
      throw new Error('...')
    },
  })

  await client.connect()

  const stop = await outbox.start()

  await setTimeout(1000)

  process.on('SIGTERM', () => {
    ;(async () => {
      await stop()
      await client.close()
    })().catch(console.error)
  })
  // ;(async () => {
  //   const cursor = db.collection('__outboxMessages').watch()
  //   for await (const change of cursor) {
  //     console.log('Received change: ', change)
  //   }
  // })().catch(console.error)

  // for (let i = 0; i < 1; i++) {
  //   await client.withSession(async (session) => {
  //     await session.withTransaction(async (session) => {
  //       await outbox.publishEvent(
  //         {
  //           name: 'MedicineAdded',
  //           data: {
  //             medicineId: 'med1',
  //             patientId: 'patient99',
  //           },
  //         },
  //         session,
  //       )
  //     })
  //   })
  // }

  while (true) {
    await setTimeout(1000)
  }
})().catch((error) => {
  throw error
})
