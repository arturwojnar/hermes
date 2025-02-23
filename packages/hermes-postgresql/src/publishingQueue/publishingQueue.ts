import { CancellationPromise, Duration } from '@arturwojnar/hermes'
import { DeepReadonly } from 'ts-essentials'
import { Transaction } from '../subscribeToReplicationSlot/types.js'

type PublishingQueueType = 'SerializedPublishingQueue' | 'NonBlockingPublishingQueue' | string

type MessageToPublish<InsertResult> = {
  transaction: Transaction<InsertResult>
  acknowledge: () => Promise<void>
}

type PublishingQueueOptions<InsertResult> = {
  waitAfterFailedPublish?: Duration
  onFailedPublish?: (tx: Transaction<InsertResult>) => Promise<void>
}

type PublishingQueue<Name extends PublishingQueueType = PublishingQueueType, InsertResult = unknown> = DeepReadonly<{
  queue: (messageToPublish: MessageToPublish<InsertResult>) => MessageToPublish<InsertResult>
  run: (messageToPublish?: MessageToPublish<InsertResult>) => Promise<void>
  size: () => number
  waitUntilIsEmpty: () => CancellationPromise
  name(): Name
}>

export type { MessageToPublish, PublishingQueue, PublishingQueueOptions, PublishingQueueType }
