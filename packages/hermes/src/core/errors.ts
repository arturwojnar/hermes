enum HermesErrorCode {
  Assertion = 'Assertion',
  NotSupportedMongoVersion = 'NotSupportedMongoVersion',
}
type HermesErrorDetails<T extends Record<string, unknown> = Record<string, never>> = {
  [K in keyof T]: T[K]
}

abstract class HermesError<
  T extends Record<string, unknown> = Record<string, never>,
  Code extends string = HermesErrorCode,
> extends Error {
  constructor(
    public code: Code,
    public details?: HermesErrorDetails<T>,
    message?: string,
  ) {
    super(message)
  }
}

class AssertionError extends HermesError<{ forKey?: string; forValue?: any }> {
  constructor(
    public details: HermesErrorDetails<{ forKey?: string; forValue?: any }>,
    message?: string,
  ) {
    super(HermesErrorCode.Assertion, details, message)
  }
}

class NotSupportedMongoVersionError extends HermesError<{ supportedVersions: number[]; currentVersion: string }> {
  constructor(
    public details?: HermesErrorDetails<{ supportedVersions: number[]; currentVersion: string }>,
    message?: string,
  ) {
    super(HermesErrorCode.NotSupportedMongoVersion, details, message)
  }
}

export { AssertionError, HermesError, HermesErrorCode, NotSupportedMongoVersionError }
