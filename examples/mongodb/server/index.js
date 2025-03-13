import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { createOutboxConsumer } from '@arturwojnar/hermes-mongodb'
import { addDisposeOnSigterm } from '@arturwojnar/hermes'
import { MongoClient } from 'mongodb'

const app = express()
const hostname = '0.0.0.0'
const mongoUri = process.env.MONGODB_URI || `mongodb://localhost:27018/?replicaSet=rs0&directConnection=true`
const pulsarUri = process.env.PULSAR_URI || `pulsar://localhost:6650`
const port = process.env.PORT || 3000
const client = new MongoClient(mongoUri)
const db = client.db('aid-kit')
const outbox = createOutboxConsumer({
  client,
  db,
  publish: async (event) => {
    console.info(JSON.stringify(event, null, 2))
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

app.get('/test', (_req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify({ ok: true }, null, 2))
})

app.listen(port, hostname)

console.info(`App started at ${port} on ${hostname}.`)
;(async () => {
  try {
    await client.connect()
    const stop = outbox.start()

    console.info(`...`)

    addDisposeOnSigterm(() => stop())
  } catch (error) {
    console.error(error)
  }
})()
