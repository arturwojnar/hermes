import { Sql } from 'postgres'
import { Lsn } from './common/lsn.js'

const getRestartLsn = async (sql: Sql) => {
  const restartLsnResults = await sql<
    [{ restart_lsn: Lsn }]
  >`SELECT * FROM pg_replication_slots WHERE slot_name = 'hermes_slot';`
  return restartLsnResults?.[0]?.restart_lsn || '0/00000000'
}

export { getRestartLsn }
