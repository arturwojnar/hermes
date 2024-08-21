import { NotSupportedMongoVersionError, parseSemVer } from '@arturwojnar/hermes'
import { Db, Document } from 'mongodb'
import { SupportedMajorMongoVersions } from './consts'

// https://www.mongodb.com/docs/manual/reference/command/buildInfo/
export type BuildInfo = {
  version: string
  gitVersion: string
  sysInfo: string
  loaderFlags: string
  compilerFlags: string
  allocator: string
  versionArray: number[]
  openssl: Document
  javascriptEngine: string
  bits: number
  debug: boolean
  maxBsonObjectSize: number
  storageEngines: string[]
  ok: number
}
export type ChangeStreamFullDocumentValuePolicy = () => 'whenAvailable' | 'updateLookup' | never

export const generateVersionPolicies = async (db: Db) => {
  const buildInfo = (await db.admin().buildInfo()) as BuildInfo
  const semver = parseSemVer(buildInfo.version)
  const major = semver.major || 0
  const throwNotSupportedError = () => {
    throw new NotSupportedMongoVersionError({
      currentVersion: buildInfo.version,
      supportedVersions: SupportedMajorMongoVersions,
    })
  }

  const supportedVersionCheckPolicy = () => {
    if (major < 5) {
      throwNotSupportedError()
    }
  }
  const changeStreamFullDocumentValuePolicy = (() => {
    if (major >= 6) {
      return 'whenAvailable'
    } else if (major === 5) {
      return 'updateLookup'
    } else {
      throwNotSupportedError()
    }
  }) as ChangeStreamFullDocumentValuePolicy

  return {
    supportedVersionCheckPolicy,
    changeStreamFullDocumentValuePolicy,
  }
}
