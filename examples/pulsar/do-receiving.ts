import { setTimeout } from 'node:timers/promises'
import { Consumer } from 'pulsar-client'

export const doReceiving = async (subscription: Consumer) => {
  while (true) {
    try {
      const message = await subscription.receive()
      const event = JSON.parse(message.getData().toString('utf-8'))

      console.info(`Consumed event for medicine ${event.data.medicineId} and patient ${event.data.patientId}`)
    } catch {
      await setTimeout(1000)
    }
  }
}
