import { swallow } from './utils.js'

export const addDisposeOnSigterm = (fn: () => Promise<void>) => {
  process.on('SIGTERM', () => {
    swallow(fn)
    console.info(`[outbox.addDisposeOnSigterm] Outbox consumer has stopped.`)
  })
  process.on('SIGINT', () => {
    swallow(fn)
    console.info(`[outbox.addDisposeOnSigterm] Outbox consumer has stopped.`)
  })
}
