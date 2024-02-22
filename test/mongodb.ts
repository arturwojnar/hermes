import { MongoClient } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { swallow } from '../src/utils'

export const mongodb = async (
  test: (client: MongoClient, onDispose: (fn: () => Promise<void>) => void) => Promise<void | never>,
) => {
  let replSet: MongoMemoryReplSet | null = null
  let con: MongoClient | null = null

  try {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      binary: { version: '7.0.5' },
    })
    con = await MongoClient.connect(replSet.getUri(), {})
    const disposable: (() => Promise<void>)[] = []
    const onDispose = (fn: () => Promise<void>) => {
      disposable.push(fn)
    }

    try {
      await test(con, onDispose)
    } finally {
      disposable.length && (await Promise.all(disposable.map((fn) => swallow(fn))))
      con && (await swallow(con.close.bind(con)))
      replSet && (await swallow(replSet.stop.bind(replSet)))
    }
  } catch (e) {
    con && (await swallow(con.close.bind(con)))
    replSet && (await swallow(replSet.stop.bind(replSet)))

    throw e
  }
}
