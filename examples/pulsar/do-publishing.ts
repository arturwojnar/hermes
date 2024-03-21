import { setTimeout } from 'node:timers/promises'
import { OutboxConsumer } from '../../packages/hermes-mongodb/src/typings'
import { MedicineEvent } from '../events'
import { ObjectId } from '../node_modules/mongodb/mongodb'

export const doPublishing = async (outbox: OutboxConsumer<MedicineEvent>) => {
  while (true) {
    const medicineId = new ObjectId().toString()
    const patientId = new ObjectId().toString()

    try {
      await outbox.publish({
        name: 'MedicineAssigned',
        data: {
          medicineId,
          patientId,
        },
      })
    } catch {
      await setTimeout(1000)
      continue
    }

    console.info(`Event published for medicine ${medicineId} nad patient ${patientId}.`)

    await setTimeout(1000)
  }
}
