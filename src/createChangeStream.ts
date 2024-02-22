import { Collection, ResumeToken } from 'mongodb'
import { PipelineStage } from 'mongoose'
import { OutboxMessage, OutboxMessageStream } from './typings'

const createChangeStream = <Event>(
  messages: Collection<OutboxMessage<Event>>,
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
  return messages.watch<OutboxMessage<Event>, OutboxMessageStream<Event>>(pipeline, {
    fullDocument: 'whenAvailable',
    startAfter: resumeToken,
  })
}

export { createChangeStream }
