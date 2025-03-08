import { Duration } from '@arturwojnar/hermes'
import { MessageToPublish } from '../publishingQueue.js'

type StateMessage<InsertResult> = MessageToPublish<InsertResult> & { delivered: boolean; failed: boolean }

type ResendingStrategyParamse<InsertResult> = {
  getMessages: () => StateMessage<InsertResult>[]
  publishMessage: (message: MessageToPublish<InsertResult>) => Promise<unknown>
  isPublishing: () => boolean
  interval: Duration
}
type ResendingStrategy<InsertResult> = (params: ResendingStrategyParamse<InsertResult>) => () => void

export type { ResendingStrategy, StateMessage }
