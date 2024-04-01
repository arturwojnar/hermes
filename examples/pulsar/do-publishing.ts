import { OutboxConsumer } from '@arturwojnar/hermes-mongodb'
import { ObjectId } from 'mongodb'
import { setTimeout } from 'node:timers/promises'
import { MedicineEvent } from '../common/events'

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
