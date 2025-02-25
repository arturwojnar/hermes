import { HermesError } from '@arturwojnar/hermes'
import { DeepReadonly } from 'ts-essentials'

enum HermesErrorCode {
  ConsumerAlreadyTaken = 'ConsumerAlreadyTaken',
}

type ConsumerAlreadyTakenParams = DeepReadonly<{ consumerName: string; partitionKey: string }>

class HermesConsumerAlreadyTakenError extends HermesError<
  ConsumerAlreadyTakenParams,
  HermesErrorCode.ConsumerAlreadyTaken
> {
  constructor(params: ConsumerAlreadyTakenParams) {
    super(
      HermesErrorCode.ConsumerAlreadyTaken,
      params,
      `Consumer ${params.consumerName} with the ${params.partitionKey} has been already taken by another PID.`,
    )
  }
}

export { HermesConsumerAlreadyTakenError }
