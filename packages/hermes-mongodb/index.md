## ⚙️ Install

```bash
npm i @arturwojnar/hermes @arturwojnar/hermes-mongodb
```

## 😍 Supported versions of the MongoDB

➡️ **5**.x.x 😙\
➡️ **6**.x.x 😚\
➡️ **7**.x.x 😛\
➡️ **8**.0.0-rc.x 😎

If you don't belive it, check how these☝️ versions are covered by tests [here](https://github.com/arturwojnar/hermes/blob/main/packages/hermes-mongodb/test/simple.test.ts#L14)!

## 📒 API

<a href="modules.html">See the full docs.</a>

## ⚠️ Caveats

The implementation is based on the `MongoDB Change Streams`, so internally the `oplog` is used.\
The `oplog` gets removed _if it passes the specified time period or if the oplog reaches the maximum size_.\
So, _if your event are not processed successfully by then, you will loose them_.

See the [official docs](https://www.mongodb.com/docs/manual/core/replica-set-oplog/).
