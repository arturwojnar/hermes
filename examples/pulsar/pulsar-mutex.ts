import { setTimeout } from 'node:timers/promises'
import { Client, Consumer } from 'pulsar-client'

const DEFAULT_MUTEX_NAME = 'mutex' as const
const CHECK_MUTEX_EVERY_N_MINUTES = 30 * 1000

export class PulsarMutex {
  constructor(
    private _client: Client,
    private _mutexTopic: string = `public/default/mutex`,
    private _waitAfterFailedSubscription = CHECK_MUTEX_EVERY_N_MINUTES,
  ) {}

  private _mutex: Consumer | null = null

  async lock(): Promise<void> {
    while (true) {
      try {
        this._mutex = await this._client.subscribe({
          topic: this._mutexTopic,
          subscription: DEFAULT_MUTEX_NAME,
          subscriptionType: 'Exclusive',
        })

        return
      } catch {
        await setTimeout(this._waitAfterFailedSubscription)
      }
    }
  }

  async unlock(): Promise<void> {
    if (this._mutex && this._mutex.isConnected()) {
      await this._mutex.unsubscribe()
    }
  }
}
