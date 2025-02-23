import { CancellationPromise } from '@arturwojnar/hermes'
import { createSimpleQueue } from './createSimpleQueue.js'

type Item<T = unknown> = () => Promise<T>

const createAsyncOpsQueue = <T = unknown>() => {
  const _ops = createSimpleQueue<Item<T>>()
  let opInProgress = CancellationPromise.resolved<ReturnType<Item<T>>>()

  const queue = (op: Item<T>) => {
    _ops.queue(op)
    return op
  }

  const waitFor = async (op: Item<T>) => {
    if (opInProgress.isPending) {
      await opInProgress
    }

    opInProgress = new CancellationPromise<ReturnType<Item<T>>>()

    try {
      await op()
      _ops.remove(op)
    } finally {
      opInProgress.resolve()
    }
  }

  return { queue, waitFor }
}

export { createAsyncOpsQueue }
