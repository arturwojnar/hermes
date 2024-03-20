import { swallow } from '@arturwojnar/hermes'
import { Db, MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { setInterval } from 'node:timers/promises'

let replSet: MongoMemoryReplSet | null = null
let connection: MongoClient | null = null
let instances = 0

export const mongodb = async (
  test: (db: Db, client: MongoClient, onDispose: (fn: () => Promise<void>) => void) => Promise<void | never>,
  version = '7.0.5',
) => {
  if (!replSet || !connection) {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      binary: { version },
    })
    connection = await MongoClient.connect(replSet.getUri(), {})
    ;(async () => {
      let checks = 0

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of setInterval(2000)) {
        if (instances === 0 && checks < 3) {
          checks++
        } else if (instances === 0 && checks >= 3) {
          connection && (await swallow(connection.close.bind(connection)))
          replSet && (await swallow(replSet.stop.bind(replSet)))
          break
        } else {
          checks = 0
        }
      }
    })().catch(console.error)
  }

  const disposable: (() => Promise<void>)[] = []
  const onDispose = (fn: () => Promise<void>) => {
    disposable.push(fn)
  }
  const db = connection.db(`db_${new ObjectId().toString()}`)
  instances++

  try {
    await test(db, connection, onDispose)
  } finally {
    await Promise.all(disposable.map((fn) => swallow(fn)))
    await swallow(() => db.dropDatabase())
    instances--
  }
}
