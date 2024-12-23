import { Collection, type ResumeToken } from 'mongodb'
import { type PipelineStage } from 'mongoose'
import { type OutboxMessageModel, type OutboxMessageStream } from './typings.js'
import { ChangeStreamFullDocumentValuePolicy } from './versionPolicies.js'

const createChangeStream = <Event>(
  getFullDocumentValue: ChangeStreamFullDocumentValuePolicy,
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
    fullDocument: getFullDocumentValue(),
    startAfter: resumeToken,
  })
}

export { createChangeStream }
