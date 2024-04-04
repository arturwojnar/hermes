enum HermesErrorCode {
  Assertion = 'Assertion',
}

type HermesErrorDetails = {
  forKey?: string
  forValue?: unknown
}

abstract class HermesError extends Error {
  constructor(
    public code: HermesErrorCode,
    public details?: HermesErrorDetails,
    message?: string,
  ) {
    super(message)
  }
}

class AssertionError extends HermesError {
  constructor(
    public details?: HermesErrorDetails,
    message?: string,
  ) {
    super(HermesErrorCode.Assertion, details, message)
  }
}

export { AssertionError, HermesError, HermesErrorCode }
