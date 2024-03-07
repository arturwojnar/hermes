import { AsyncOrSync } from 'ts-essentials'

const noop = () => {}
const isNil = (value: unknown) => typeof value === 'undefined' || value === null
const swallow = (fn: () => AsyncOrSync<unknown>): AsyncOrSync<unknown> => {
  try {
    const result = fn()

    if (result && result instanceof Promise && result.catch) {
      return result.catch(noop)
    } else {
      return
    }
  } catch {
    // swallow
  }
}

export { isNil, noop, swallow }
