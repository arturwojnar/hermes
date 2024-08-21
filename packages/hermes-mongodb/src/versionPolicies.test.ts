import { NotSupportedMongoVersionError } from '@arturwojnar/hermes'
import { describe, expect, it, jest } from '@jest/globals'
import { Db } from 'mongodb'
import { BuildInfo, generateVersionPolicies } from './versionPolicies'

describe('generateVersionPolicies', () => {
  const mockBuildInfo = (version: string): BuildInfo => ({
    version,
    gitVersion: 'mock',
    sysInfo: 'mock',
    loaderFlags: 'mock',
    compilerFlags: 'mock',
    allocator: 'mock',
    versionArray: [],
    openssl: {},
    javascriptEngine: 'mock',
    bits: 64,
    debug: false,
    maxBsonObjectSize: 16777216,
    storageEngines: [],
    ok: 1,
  })

  const mockDb = (version: string): Db =>
    ({
      admin: () => ({
        buildInfo: jest.fn<(version: string) => Promise<BuildInfo>>().mockResolvedValue(mockBuildInfo(version)),
      }),
    }) as unknown as Db

  describe('supportedVersionCheckPolicy', () => {
    it('should throw NotSupportedMongoVersionError for version 4.x.x', async () => {
      const db = mockDb('4.4.0')
      const policies = await generateVersionPolicies(db)
      expect(() => policies.supportedVersionCheckPolicy()).toThrow(NotSupportedMongoVersionError)
    })
    it('should work for 5.x.x', async () => {
      const db = mockDb('5.0.1')
      const policies = await generateVersionPolicies(db)
      expect(() => policies.supportedVersionCheckPolicy()).not.toThrow(NotSupportedMongoVersionError)
    })
    it('should work for 6.x.x', async () => {
      const db = mockDb('6.0.1')
      const policies = await generateVersionPolicies(db)
      expect(() => policies.supportedVersionCheckPolicy()).not.toThrow(NotSupportedMongoVersionError)
    })
    it('should work for 7.x.x', async () => {
      const db = mockDb('7.0.1')
      const policies = await generateVersionPolicies(db)
      expect(() => policies.supportedVersionCheckPolicy()).not.toThrow(NotSupportedMongoVersionError)
    })
    it('should work for 8.x.x-rc.x', async () => {
      const db = mockDb('8.0.0-rc.18')
      const policies = await generateVersionPolicies(db)
      expect(() => policies.supportedVersionCheckPolicy()).not.toThrow(NotSupportedMongoVersionError)
    })
  })

  describe('changeStreamFullDocumentValuePolicy', () => {
    it('should throw NotSupportedMongoVersionError for version 4.x.x', async () => {
      const db = mockDb('4.4.0')
      const policies = await generateVersionPolicies(db)
      expect(() => policies.changeStreamFullDocumentValuePolicy()).toThrow(NotSupportedMongoVersionError)
    })
    it('change stream full document option should be `updateLookup` for 5.x.x', async () => {
      const db = mockDb('5.0.1')
      const policies = await generateVersionPolicies(db)
      expect(policies.changeStreamFullDocumentValuePolicy()).toBe('updateLookup')
    })
    it('change stream full document option should be `whenAvailable` for 6.x.x', async () => {
      const db = mockDb('6.0.1')
      const policies = await generateVersionPolicies(db)
      expect(policies.changeStreamFullDocumentValuePolicy()).toBe('whenAvailable')
    })
    it('change stream full document option should be `whenAvailable` for 7.x.x', async () => {
      const db = mockDb('7.0.1')
      const policies = await generateVersionPolicies(db)
      expect(policies.changeStreamFullDocumentValuePolicy()).toBe('whenAvailable')
    })
    it('change stream full document option should be `whenAvailable` for 8.x.x-rc.x', async () => {
      const db = mockDb('8.0.0-rc.18')
      const policies = await generateVersionPolicies(db)
      expect(policies.changeStreamFullDocumentValuePolicy()).toBe('whenAvailable')
    })
  })

  // it('should return correct policies for version 5.x', async () => {
  //   const db = mockDb('5.0.0')
  //   const policies = await generateVersionPolicies(db)

  //   expect(policies.supportedVersionCheckPolicy).not.toThrow()
  //   expect(policies.changeStreamFullDocumentValuePolicy()).toBe('updateLookup')
  // })

  // it('should return correct policies for version 6.x', async () => {
  //   const db = mockDb('6.0.0')
  //   const policies = await generateVersionPolicies(db)

  //   expect(policies.supportedVersionCheckPolicy).not.toThrow()
  //   expect(policies.changeStreamFullDocumentValuePolicy()).toBe('whenAvailable')
  // })

  // it('should return correct policies for version 7.x', async () => {
  //   const db = mockDb('7.0.0')
  //   const policies = await generateVersionPolicies(db)

  //   expect(policies.supportedVersionCheckPolicy).not.toThrow()
  //   expect(policies.changeStreamFullDocumentValuePolicy()).toBe('whenAvailable')
  // })

  // it('should throw NotSupportedMongoVersionError when calling supportedVersionCheckPolicy for version 4.x', async () => {
  //   const db = mockDb('4.4.0')
  //   await expect(generateVersionPolicies(db)).rejects.toThrow(NotSupportedMongoVersionError)
  // })

  // it('should pass the correct arguments to NotSupportedMongoVersionError', async () => {
  //   const db = mockDb('4.4.0')
  //   try {
  //     await generateVersionPolicies(db)
  //   } catch (error) {
  //     expect(NotSupportedMongoVersionError).toHaveBeenCalledWith({
  //       currentVersion: '4.4.0',
  //       supportedVersions: SupportedMajorMongoVersions,
  //     })
  //   }
  // })
})
