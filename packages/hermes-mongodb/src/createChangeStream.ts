import { Collection, type ResumeToken } from 'mongodb'
import { type PipelineStage } from 'mongoose'
import { type OutboxMessageModel, type OutboxMessageStream } from './typings'

const createChangeStream = <Event>(
  messages: Collection<OutboxMessageModel<Event>>,
  partitionKey: string,
  resumeToken?: ResumeToken,
) => {
  const pipeline: PipelineStage[] = [
    {
      $match: <Partial<OutboxMessageStream<Event>>>{
        operationType: 'insert',
        'fullDocument.partitionKey': partitionKey,
      },
    },
  ]
  return messages.watch<OutboxMessageModel<Event>, OutboxMessageStream<Event>>(pipeline, {
    fullDocument: 'whenAvailable',
    startAfter: resumeToken,
  })
}

export { createChangeStream }
