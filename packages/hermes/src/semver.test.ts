import { describe, expect, test } from '@jest/globals'
import { parseSemVer } from './utils/semver.js'

describe('semver', () => {
  test('parses version 12.13.14', () => {
    const result = parseSemVer('12.13.14')
    expect(result).toEqual({
      major: 12,
      minor: 13,
      bugfix: 14,
      rc: undefined,
    })
  })

  test('parses version 1.2.27-rc.10', () => {
    const result = parseSemVer('1.2.27-rc.10')
    expect(result).toEqual({
      major: 1,
      minor: 2,
      bugfix: 27,
      rc: 'rc.10',
    })
  })

  test('parses improper semver', () => {
    const result = parseSemVer('3-beta.45')
    expect(result).toEqual({
      major: undefined,
      minor: undefined,
      bugfix: undefined,
      rc: undefined,
    })
  })

  test('handles empty string', () => {
    const result = parseSemVer('')
    expect(result).toEqual({
      major: undefined,
      minor: undefined,
      bugfix: undefined,
      rc: undefined,
    })
  })

  test('handles null input', () => {
    const result = parseSemVer(null as unknown as string)
    expect(result).toEqual({
      major: undefined,
      minor: undefined,
      bugfix: undefined,
      rc: undefined,
    })
  })
})
