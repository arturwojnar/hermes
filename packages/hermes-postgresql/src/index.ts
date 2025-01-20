/* -eslint-disable  @typescript-eslint/no-unused-vars */
import { createOutboxConsumer } from './outbox/createOutboxConsumer.js'

const test = async () => {
  try {
    const hermes = createOutboxConsumer({
      getOptions() {
        return {
          host: 'localhost',
          port: 5434,
          database: 'hermes',
          user: 'hermes',
          password: 'hermes',
        }
      },
      publish: (event) => {
        // return Promise.resolve()
        return Promise.reject(new Error())
      },
      consumerName: 'app',
    })

    const stop = await hermes.start()
    const sql = hermes.getDbConnection()

    process.on('SIGTERM', () => {
      stop().catch(console.error)
    })

    const i = 99999
  } catch (e) {
    console.error(e) // code 55006 PostgresError routine ='ReplicationSlotAcquire'
  }

  // while (++i) {
  //   await setTimeout(Duration.ofSeconds(5).ms)
  // const json = { name: 'AddTest', i }
  // const r =
  //   await sql`INSERT INTO outbox (messageType, data) VALUES('AddTest-${sql(i.toString())}', ${sql.json(json)}) RETURNING *`
  // console.log(r?.[0])
  // }
}

// ;(async () => {
//   await test()
// })().catch((error) => {
//   console.error(error)
//   swallow(stop)
// })

export { type HermesMessageEnvelope, type MessageEnvelope } from './common/types.js'
export { createOutboxConsumer } from './outbox/createOutboxConsumer.js'
export { OutboxConsumer } from './outbox/OutboxConsumer.js'
