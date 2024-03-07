import { Collection, ResumeToken } from 'mongodb'
import { PipelineStage } from 'mongoose'
import { OutboxMessageModel, OutboxMessageStream } from './typings'

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
