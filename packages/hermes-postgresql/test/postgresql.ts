import { swallow } from '@arturwojnar/hermes'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import wrapper from 'postgres'

let instances = 0

export const postgres = async (
  test: (sql: wrapper.Sql, onDispose: (fn: () => Promise<void>) => void) => Promise<void | never>,
  version = '16.3',
) => {
  const container = await new PostgreSqlContainer(`postgres:${version}-alpine`)
    // , 'max_wal_senders=10', 'max_replication_slots=10'
    .withCommand(['postgres', '-c', 'wal_level=logical'])
    .start()

  instances++

  const disposable: (() => Promise<void>)[] = []
  const onDispose = (fn: () => Promise<void>) => {
    disposable.push(fn)
  }

  console.info(`Instance ${instances} is up.`)

  try {
    const sql = wrapper({
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    })

    await test(sql, onDispose)
  } finally {
    await Promise.all(disposable.map((fn) => swallow(fn)))
    await swallow(() => container.stop())
    instances--
    console.info(`${instances} instances is up.`)
  }
}
