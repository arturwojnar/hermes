import { createOutboxConsumer } from '@arturwojnar/hermes-mongodb'
import { MongoDBContainer } from '@testcontainers/mongodb'
import chalk from 'chalk'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { MongoClient } from 'mongodb'
import ora from 'ora'
import { AbstractStartedContainer, Wait } from 'testcontainers'
import { v4 as uuid } from 'uuid'

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
type MedicineTreatmentFinished = DomainEvent<
  'MedicineTreatmentFinished',
  {
    medicineId: string
    patientId: string
  }
>
type MedicineEvent = MedicineAssigned | MedicineTreatmentFinished
type MedicineAssignment = Readonly<{
  medicineId: string
  patientId: string
  createdAt: Date
}>

const app = express()
const hostname = '0.0.0.0'
const mongoUri = process.env.MONGODB_URI || `mongodb://localhost:27017/?directConnection=true`
const port = process.env.PORT || 3000
const client = new MongoClient(mongoUri)
const db = client.db('aid-kit')
const outbox = createOutboxConsumer<MedicineEvent>({
  client,
  db,
  publish: async (event) => {
    console.log(chalk.blue(`Received the event`), chalk.blue(JSON.stringify(event, null, 2)))
  },
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cors())
app.use(helmet())

app.get('/healthcheck', (_req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify({ ok: true }, null, 2))
})

app.post('/test', async (_req, res) => {
  const entity: MedicineAssignment = {
    medicineId: uuid(),
    patientId: uuid(),
    createdAt: new Date(),
  }

  // 👉👉👉 THis happens in one transaction 👈👈👈
  const result = await client.withSession((session) =>
    session.withTransaction(async (session) => {
      const result = await db.collection<MedicineAssignment>('medicines').insertOne(entity, { session })
      await outbox.publish(
        {
          name: 'MedicineAssigned',
          data: {
            medicineId: entity.medicineId,
            patientId: entity.patientId,
          },
        },
        session,
      )

      return result
    }),
  )

  res.setHeader('Content-Type', 'application/json')
  res.send(result)
})

app.listen(port)

console.log(chalk.blue(`\r\nApp started at ${port} on ${hostname}.\r\n\r\n`))

let deps: AbstractStartedContainer[] = []
const runDeps = async () => {
  deps = [
    await new MongoDBContainer('mongo:7.0')
      .withNetworkAliases('mongo')
      .withHostname('mongo')
      .withExposedPorts({ container: 27017, host: 27017 })
      .withHealthCheck({
        test: ['CMD-SHELL', `mongosh --port 27017 --eval "db.adminCommand('ping')" || exit 1`],
        interval: 10 * 1000,
        startPeriod: 5 * 1000,
        timeout: 15 * 1000,
        retries: 10,
      })
      .withWaitStrategy(Wait.forHealthCheck().withStartupTimeout(1 * 60 * 1000))
      .start(),
  ]
}
const stopDeps = async () => {
  await Promise.all(deps.map((dep) => dep.stop()))
}

;(async () => {
  const spinner = ora({ color: 'green', text: 'Starting the dependencies...' })

  try {
    spinner.start()

    await runDeps()

    spinner.succeed()
    spinner.start()
    spinner.text = 'Connecting to the dependencies...'

    await client.connect()

    spinner.succeed()

    outbox.start()

    console.log(chalk.green(`Everything is set!\r\n`))
    console.log(
      chalk.green(
        `Now you can run this:\r\n\r\ncurl --location --request POST 'http://localhost:3000/test'\r\n\r\nAnd see how the events are received after successfully persisting an entity 😃❤️`,
      ),
    )

    const sigterm = async () => {
      spinner.text = 'Stopping the dependencies...'
      await stopDeps()
      spinner.clear()
      process.exit()
    }

    process.on('SIGINT', sigterm)
    process.on('SIGTERM', sigterm)
  } catch (error) {
    spinner.fail()
    console.log(chalk.red(error))
  }
})()
