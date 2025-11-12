# Medicine Assignment with MongoDB: Outbox Pattern Example

This guide demonstrates how to implement the Outbox Pattern using Hermes MongoDB in a healthcare medicine assignment system. This example shows how to ensure reliable event delivery when persisting data to MongoDB.

## Overview

The medicine assignment system is a simplified healthcare scenario that involves:

1. **Assigning medicine** to a patient (database operation)
2. **Publishing an event** to notify other systems (event-driven integration)

The challenge: **How do we guarantee the event is published if and only if the database operation succeeds?**

Without the Outbox Pattern, you risk:

- 💾 Medicine assignment saved but event never published → Other systems unaware
- 📨 Event published but database operation fails → False notification
- 🔥 Inconsistent state across your distributed system

## The Problem: Two Independent Operations

Consider the naive approach:

```typescript
async function assignMedicine(medicineId: string, patientId: string) {
  // Step 1: Save to database
  await db.collection('medicines').insertOne({
    medicineId,
    patientId,
    createdAt: new Date(),
  })

  // 💥 App crashes or network fails here!

  // Step 2: Publish event to message broker
  await messageBroker.publish({
    name: 'MedicineAssigned',
    data: { medicineId, patientId },
  })
}
```

**Problems with this approach:**

- If the app crashes between operations, the event is never published
- If the message broker is down, the event is lost
- No way to recover without manual intervention
- Data and events become inconsistent

## The Solution: Outbox Pattern with MongoDB Change Streams

Hermes MongoDB leverages **MongoDB Change Streams** to implement the Outbox Pattern:

1. **Store both data and event** in a single MongoDB transaction
2. **MongoDB guarantees atomicity** - both succeed or both fail
3. **Change Streams notify Hermes** of new outbox entries in real-time
4. **Hermes publishes events** to your message broker or handlers
5. **At-least-once delivery** ensures no message is lost

### Architecture

```
Application
    ↓ (1) Start Transaction
MongoDB Session
    ↓ (2) Insert Medicine Assignment
    ↓ (3) Insert Outbox Entry
    ↓ (4) Commit Transaction
    ↓
MongoDB Change Stream
    ↓ (5) Stream Changes
Hermes Consumer
    ↓ (6) Invoke Publish Callback
Your Event Handlers
```

### Key Benefits

- ✅ **Atomic operations**: Data and events committed together
- ✅ **No message loss**: Change Streams ensure durability
- ✅ **Real-time delivery**: No polling overhead
- ✅ **At-least-once guarantee**: Events redelivered on failure
- ✅ **Simple API**: Minimal code changes required

## MongoDB Change Streams vs PostgreSQL Logical Replication

While similar in concept, there's an important difference:

**MongoDB Change Streams:**

- Based on the **oplog** (operations log)
- Oplog entries expire after a time period or size limit
- **You can lose events** if they're not processed before expiration
- Suitable for most use cases, but requires monitoring

**PostgreSQL Logical Replication:**

- Based on the **WAL** (Write-Ahead Log)
- WAL retained until acknowledged by all consumers
- **Zero message loss** guarantee
- Better for critical events that must never be lost

::: warning Oplog Expiration
MongoDB's oplog can expire if events aren't processed within the retention window. Monitor your oplog size and ensure Hermes is always running. For critical events that must never be lost, consider PostgreSQL with Logical Replication.
:::

## Implementation Walkthrough

### 1. Define Event Types

```typescript
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
```

**Design notes:**

- Use discriminated unions for type safety
- `Readonly` ensures immutability
- Generic `DomainEvent` type for consistency

### 2. Define Data Models

```typescript
type MedicineAssignment = Readonly<{
  medicineId: string
  patientId: string
  createdAt: Date
}>
```

This represents the document stored in the `medicines` collection.

### 3. Create MongoDB Client

```typescript
import { MongoClient } from 'mongodb'

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/?directConnection=true'
const client = new MongoClient(mongoUri)
const db = client.db('aid-kit')

// Connect to MongoDB
await client.connect()
```

**Configuration tips:**

- Use `directConnection=true` for local development
- For production, use replica sets (required for Change Streams)
- Change Streams require MongoDB 3.6+ running as a replica set

### 4. Create Outbox Consumer

```typescript
import { createOutboxConsumer } from '@arturwojnar/hermes-mongodb'

const outbox = createOutboxConsumer<MedicineEvent>({
  client,
  db,
  publish: async (event) => {
    /*
      If this callback successfully finishes ✅,
      then the event is considered as delivered 📨🎉

      If this callback throws an error ⛔,
      then Hermes MongoDB will try to deliver this message again later ⏲️
    */
    console.log('Received event:', JSON.stringify(event, null, 2))

    // In production, publish to your message broker:
    // await messageBroker.publish(event)
    // await eventBus.publish(event)
    // await kafka.send({ topic: 'medicine-events', messages: [event] })
  },
})

// Start consuming events
outbox.start()
```

**Key configuration:**

- `client`: MongoDB client instance (must be connected)
- `db`: Database instance where outbox collection will be created
- `publish`: Callback invoked for each event (must throw on failure for retry)

**The `publish` callback contract:**

- ✅ **Success**: If callback completes without error, event is acknowledged
- ❌ **Failure**: If callback throws, event remains unacknowledged and will be retried
- 🔄 **Retries**: Hermes automatically retries failed events

### 5. Implement Transactional Event Publishing

This is the core pattern - persisting data and publishing events in a **single transaction**:

```typescript
app.post('/test', async (_req, res) => {
  const entity: MedicineAssignment = {
    medicineId: uuid(),
    patientId: uuid(),
    createdAt: new Date(),
  }

  // 👉 This happens in ONE transaction 👈
  const result = await client.withSession((session) =>
    session.withTransaction(async (session) => {
      // Step 1: Insert the medicine assignment
      const result = await db.collection<MedicineAssignment>('medicines').insertOne(entity, { session })

      // Step 2: Publish event in the SAME transaction
      await outbox.publish(
        {
          name: 'MedicineAssigned',
          data: {
            medicineId: entity.medicineId,
            patientId: entity.patientId,
          },
        },
        session, // ← Pass session for transactional consistency
      )

      return result
    }),
  )

  res.setHeader('Content-Type', 'application/json')
  res.send(result)
})
```

**Critical pattern: Pass the session to `outbox.publish()`**

```typescript
await outbox.publish(event, session) // ← Session ensures atomicity
```

This guarantees:

- Either **both** the data and event are committed
- Or **neither** are committed
- No inconsistent state is possible

### Alternative: Using Outbox-Managed Transactions

You can also let Hermes manage the transaction:

```typescript
await outbox.publish(event, async (session, db) => {
  // Hermes starts a session and transaction for you
  await db.collection('medicines').insertOne(entity, { session })

  // Both operations committed atomically
})
```

This approach is simpler but less flexible if you need more control over the transaction.

## Complete Example

Here's the full working implementation:

```typescript
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
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/?directConnection=true'
const port = process.env.PORT || 3000
const client = new MongoClient(mongoUri)
const db = client.db('aid-kit')

// Create outbox consumer
const outbox = createOutboxConsumer<MedicineEvent>({
  client,
  db,
  publish: async (event) => {
    console.log(chalk.blue('Received the event'), chalk.blue(JSON.stringify(event, null, 2)))
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

  // Transactional event publishing
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

// Container management for local development
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

    console.log(chalk.green('Everything is set!\r\n'))
    console.log(
      chalk.green(
        `Now you can run this:\r\n\r\ncurl --location --request POST 'http://localhost:3000/test'\r\n\r\nAnd see how the events are received after successfully persisting an entity 😃❤️`,
      ),
    )

    const sigterm = async () => {
      spinner.text = 'Stopping the dependencies...'
      await stopDeps()
      spinner.succeed()
      process.exit()
    }

    process.on('SIGINT', sigterm)
    process.on('SIGTERM', sigterm)
  } catch (error) {
    spinner.fail()
    console.log(chalk.red(error))
  }
})()
```

## Running the Example

### Prerequisites

```bash
# Ensure Docker is running (for MongoDB test container)
```

### Running the Example

First, navigate to the example directory and install dependencies:

```bash
cd examples/mongodb/server
npm install
```

Build the TypeScript code:

```bash
npm run build
```

Then run the example:

```bash
npm start
```

This will:

1. Start a MongoDB container (version 7.0)
2. Configure it as a replica set (required for Change Streams)
3. Connect to MongoDB
4. Start the Hermes outbox consumer
5. Start an Express server on port 3000

### Testing Medicine Assignment

```bash
curl --location --request POST 'http://localhost:3000/test'
```

**Expected output:**

```json
{
  "acknowledged": true,
  "insertedId": "674d8e5f9c8b1234567890ab"
}
```

**Console output:**

```
Received the event {
  "name": "MedicineAssigned",
  "data": {
    "medicineId": "550e8400-e29b-41d4-a716-446655440000",
    "patientId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
  }
}
```

### Testing Healthcheck

```bash
curl http://localhost:3000/healthcheck
```

**Expected output:**

```json
{
  "ok": true
}
```

## Key Patterns and Best Practices

### 1. Always Use Transactions

Never publish events outside a transaction:

```typescript
// ✅ Good: Transactional
await client.withSession((session) =>
  session.withTransaction(async (session) => {
    await db.collection('medicines').insertOne(entity, { session })
    await outbox.publish(event, session) // Atomic
  }),
)

// ❌ Bad: Not transactional
await db.collection('medicines').insertOne(entity)
await outbox.publish(event) // Separate operation, not atomic!
```

### 2. Handle Idempotency in Event Handlers

Since Hermes guarantees **at-least-once delivery**, your event handlers may be called multiple times:

```typescript
publish: async (event) => {
  // Check if already processed
  const processed = await db.collection('processed_events').findOne({ eventId: event.messageId })

  if (processed) {
    console.log('Event already processed, skipping')
    return // Safe to skip
  }

  // Process the event
  await handleEvent(event)

  // Mark as processed
  await db.collection('processed_events').insertOne({ eventId: event.messageId, processedAt: new Date() })
}
```

### 3. Monitor Oplog Size and Retention

Unlike PostgreSQL WAL, MongoDB's oplog can expire:

```javascript
// Check oplog status
use local
db.oplog.rs.find().sort({$natural: -1}).limit(1)

// Check oplog size
db.oplog.rs.stats()
```

**Best practices:**

- Monitor oplog size regularly
- Ensure Hermes consumer is always running
- Alert if oplog is growing faster than consumption
- Consider increasing oplog size if needed

### 4. Use Replica Sets in Production

Change Streams require MongoDB to run as a replica set:

```yaml
# docker-compose.yml example
services:
  mongo:
    image: mongo:7.0
    command: mongod --replSet rs0
    ports:
      - '27017:27017'
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
```

Initialize replica set:

```bash
mongosh --eval "rs.initiate()"
```

### 5. Graceful Shutdown

Always stop the outbox consumer gracefully:

```typescript
const cleanup = () => {
  outbox.stop()
  client.close()
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
```

## Advanced Configuration

### Partition Keys for Horizontal Scaling

Scale horizontally by partitioning events:

```typescript
const outbox1 = createOutboxConsumer<MedicineEvent>({
  client,
  db,
  publish: publishToTenant1,
  partitionKey: 'tenant-1',
})

const outbox2 = createOutboxConsumer<MedicineEvent>({
  client,
  db,
  publish: publishToTenant2,
  partitionKey: 'tenant-2',
})
```

Each outbox consumer processes events from its partition independently.

### Custom Collection Names

By default, Hermes creates a collection named `hermes_outbox`. You can customize this:

```typescript
const outbox = createOutboxConsumer<MedicineEvent>({
  client,
  db,
  publish,
  collectionName: 'custom_outbox', // Custom outbox collection
})
```

### Consumer Name

Prevent multiple consumers from competing:

```typescript
const outbox = createOutboxConsumer<MedicineEvent>({
  client,
  db,
  publish,
  consumerName: 'medicine-service', // Unique consumer identifier
})
```

Only one consumer with the same name can run at a time.

## Troubleshooting

### "Change Streams require MongoDB to be running as a replica set"

**Solution**: Initialize MongoDB as a replica set:

```bash
mongosh --eval "rs.initiate()"
```

For Docker:

```bash
docker exec -it <container-id> mongosh --eval "rs.initiate()"
```

### Events not being processed

**Check:**

1. Is MongoDB running as a replica set? (`rs.status()`)
2. Is the outbox consumer started? (`outbox.start()`)
3. Are there errors in the `publish` callback?
4. Check MongoDB logs for Change Stream errors

### Oplog full or events lost

**Solutions:**

1. Increase oplog size:

   ```javascript
   db.adminCommand({ replSetResizeOplog: 1, size: 16000 }) // 16GB
   ```

2. Ensure consumers are processing events quickly
3. Monitor oplog usage with alerts
4. Consider moving to PostgreSQL for critical events

### High memory usage

**Causes:**

- Change Stream buffering too many events
- Slow event processing
- Large event payloads

**Solutions:**

- Optimize event handlers for performance
- Reduce event payload size
- Scale horizontally with partition keys
- Monitor resource usage

## MongoDB Versions Support

Hermes MongoDB supports:

- ✅ MongoDB **5.x.x**
- ✅ MongoDB **6.x.x**
- ✅ MongoDB **7.x.x**
- ✅ MongoDB **8.0.0-rc.x**

All versions are tested in CI. See the [test suite](https://github.com/arturwojnar/hermes/blob/main/packages/hermes-mongodb/test/simple.test.ts) for details.

## Comparison: MongoDB vs PostgreSQL

| Feature          | MongoDB (Change Streams)    | PostgreSQL (Logical Replication) |
| ---------------- | --------------------------- | -------------------------------- |
| **Message Loss** | Possible (oplog expiration) | Zero (WAL retained)              |
| **Performance**  | Excellent                   | Excellent                        |
| **Overhead**     | No polling                  | No polling                       |
| **Complexity**   | Simple                      | Moderate                         |
| **Scalability**  | Partition keys              | Partition keys                   |
| **Best For**     | Non-critical events         | Critical events                  |

**When to use MongoDB:**

- You already use MongoDB
- Events are not mission-critical
- You can tolerate rare message loss
- You want simpler setup

**When to use PostgreSQL:**

- Zero message loss is required
- Events are mission-critical (e.g., financial transactions)
- You need guaranteed delivery
- You can invest in monitoring WAL retention

## Related Resources

- [Hermes MongoDB Package](https://github.com/arturwojnar/hermes/tree/main/packages/hermes-mongodb)
- [MongoDB Change Streams Documentation](https://www.mongodb.com/docs/manual/changeStreams/)
- [MongoDB Oplog Documentation](https://www.mongodb.com/docs/manual/core/replica-set-oplog/)
- [Outbox Pattern Overview](https://microservices.io/patterns/data/transactional-outbox.html)

## Summary

The medicine assignment example demonstrates:

✅ **Atomic operations** with MongoDB transactions

✅ **Real-time event delivery** via Change Streams

✅ **At-least-once delivery** for reliability

✅ **Simple API** with minimal code

✅ **Production-ready** patterns

By using Hermes MongoDB, you can implement the Outbox Pattern with minimal complexity while ensuring data and events stay consistent across your distributed system.

::: tip Next Steps

- Try the [PostgreSQL Patient Registration](/pages/postgresql-patient-registration.md) example for zero message loss guarantees
- Explore [RabbitMQ integration](/pages/rabbitmq.md) for message broker patterns
- Check out [Apache Pulsar examples](/pages/pulsar.md) for cloud-native messaging
  :::
