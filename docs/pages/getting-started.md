## ⚙️ Install

If you work with **MongoDB**, then:

```bash
npm i @arturwojnar/hermes @arturwojnar/hermes-mongodb
```

## 💡 The easiest example for MongoDB

First, create an OutboxConsumer instance.

```typescript
const outbox = createOutboxConsumer<Event1 | Event2>({
   client,
   client.db('hospital'),
   publish: async (event) => await eventBus.publish(event),
 })
```

Remember, that the `publish` **has to throw an error** if the delivery to the message broker fails.

Then, you can use the instance to publish events along with a database operation:

```typescript
await outbox.publish(event, async (session, db) => {
  await db.collection('test').insertOne({ param: 1 }, { session })
})
```

As you see, the `event` is passed to the `outbox.publish`. **Hermes** starts a new database session and passes it in the first callback's parameter which is the second parameter.\
The changes made in the callback will be persistend along with the passed event.\
_The event will be sent as fast as the message broker is available._

Alternatively, you can also create a session by your own:

```typescript
await client.withSession(async (session) => {
  await session.withTransaction(async (session) => {
    await outbox.publish(event1, session)
    await outbox.publish(event2, session)
  })
})
```

## Partitioning

By default, `Hermes` works on `default` partition.\
If you want to scale out `Hermes`, then you can use multiple partition keys and run separate instances for each partition key.\
Example can be running `Hermes` instances for tenants of your system. Then, each `Hermes` will be responsible for one tenant.

> ➡️ **If you noticed a performance issue**: Consider, if your application is not too big, dealing with too many messages. Maybe it's time for a redesign and try to split your application into smaller ones?

```typescript
const outbox1 = createOutboxConsumer<Event1 | Event2>({
   client,
   client.db('hospital'),
   partitionKey: 'tenant-1',
   publish,
 })
const outbox2 = createOutboxConsumer<Event1 | Event2>({
   client,
   client.db('hospital'),
   partitionKey: 'tenant-2',
   publish,
 })
```

## 🧹 Cleaning

By default, **Hermes** does the cleanup on `SIGTERM` and `SIGINT` unless `shouldDisposeOnSigterm` is seto to `false`, then you have to call `outbox.stop` by your own.
