import { assert, parseSemVer } from '@arturwojnar/hermes'

const OutboxMessagesCollectionName = '__outboxMessages'
const OutboxConsumersCollectionName = '__outboxConsumers'
const SupportedMongoVersions = ['5.0.0', '6.0.0', '7.0.0', '8.0.0-rc.18'] as const
const SupportedMajorMongoVersions = SupportedMongoVersions.map((semver) => {
  const { major } = parseSemVer(semver)

  assert(major)

  return major
})

export {
  OutboxConsumersCollectionName,
  OutboxMessagesCollectionName,
  SupportedMajorMongoVersions,
  SupportedMongoVersions,
}
