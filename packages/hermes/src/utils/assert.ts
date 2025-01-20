import { AssertionError } from '../core/errors.js'

type Assert = (
  condition: unknown,
  message?: string | AssertionError,
  details?: { actual?: unknown; field?: string },
) => asserts condition

const assert: Assert = (
  conditionToBeTruthy: unknown,
  message?: string | AssertionError,
  details?: { actual?: unknown; field?: string },
): asserts conditionToBeTruthy => {
  if (!!conditionToBeTruthy === false) {
    if (message instanceof AssertionError) {
      throw message
    }

    throw new AssertionError(
      {
        forValue: details?.actual,
        forKey: details?.field,
      },
      message,
    )
  }
}

export { assert }
