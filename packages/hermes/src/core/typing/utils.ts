export function assertNever(x: never): never {
  throw new Error(`ASSERT_NEVER`)
}
