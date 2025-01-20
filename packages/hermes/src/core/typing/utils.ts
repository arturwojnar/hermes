export function assertNever(x: never): never {
  throw new Error(`ASSERT_NEVER`)
}
export const literalObject = <T>(value: T) => value
