import { Sql } from 'postgres'
// import { getSlotName } from './common/consts.js'
import { Lsn } from './common/lsn.js'

const getSlotName = (consumerName: string, partitionKey: string) => `hermes_slot_${consumerName}_${partitionKey}`
const getRestartLsn = async (sql: Sql, consumerName: string, partitionKey = 'default') => {
  const slotName = getSlotName(consumerName, partitionKey)
  const restartLsnResults = await sql<
    [{ restart_lsn: Lsn }]
  >`SELECT * FROM pg_replication_slots WHERE slot_name = ${slotName};`
  return restartLsnResults?.[0]?.restart_lsn || '0/00000000'
}

export { getRestartLsn }
