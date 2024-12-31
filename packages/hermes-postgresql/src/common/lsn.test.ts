import { describe, expect, test } from '@jest/globals'
import {
  convertBigIntToLsn,
  convertLsnToBigInt,
  convertLsnToBuffer,
  getUpperAndLowerWAL,
  incrementWAL,
  isLsn,
  Lsn,
  toLsn,
} from './lsn.js'

describe('Log Sequence Number (LSN)', () => {
  describe('getUpperAndLowerWAL', () => {
    test('correctly splits and converts LSN parts to numbers', () => {
      const result = getUpperAndLowerWAL('16/3E100FA0')
      expect(result).toEqual([22, 1041239968])
    })
  })

  describe('convertLsnToBigInt', () => {
    test('converts LSN to bigint correctly', () => {
      const result = convertLsnToBigInt('16/3E100FA0')
      expect(result).toBe(95530520480n)

      const result2 = convertLsnToBigInt('A/A')
      expect(result2).toBe(42949672970n)
    })

    test('handles zero values', () => {
      const result = convertLsnToBigInt('0/0')
      expect(result).toBe(0n)
    })
  })

  describe('convertBigIntToLsn', () => {
    test('converts bigint to LSN format', () => {
      const result = convertBigIntToLsn(94489292704n)
      expect(result).toBe('16/2FA0')
    })

    test('handles zero value', () => {
      const result = convertBigIntToLsn(0n)
      expect(result).toBe('0/0')
    })
  })

  describe('incrementWAL', () => {
    test('increments LSN by 1', () => {
      const result = incrementWAL('16/3E100FA0')
      expect(result).toBe(95530520481n)
    })

    test('handles LSN rollover when lower part is max', () => {
      const result = incrementWAL('16/FFFFFFFF')
      expect(convertBigIntToLsn(result)).toBe('17/0')
    })

    test('handles incrementing zero LSN', () => {
      const result = incrementWAL('0/0')
      expect(convertBigIntToLsn(result)).toBe('0/1')
    })
  })

  describe('convertLsnToBuffer', () => {
    test('converts LSN to buffer correctly', () => {
      const buffer = convertLsnToBuffer('16/3E100FA0')
      expect(buffer.length).toBe(8)
      expect(buffer.readBigUInt64BE()).toBe(95530520480n)
    })

    test('handles zero LSN', () => {
      const buffer = convertLsnToBuffer('0/0')
      expect(buffer.length).toBe(8)
      expect(buffer.readBigUInt64BE()).toBe(0n)
    })
  })

  describe('isLsn', () => {
    test('validates correct LSN format', () => {
      expect(isLsn('16/3E100FA0')).toBe(true)
      expect(isLsn('0/0')).toBe(true)
      expect(isLsn('FFFFFFFF/FFFFFFFF')).toBe(true)
    })

    test('rejects invalid LSN formats', () => {
      expect(isLsn('invalid')).toBe(false)
      expect(isLsn('16/')).toBe(false)
      expect(isLsn('/3E100FA0')).toBe(false)
      expect(isLsn('16/3E100FA0G')).toBe(false) // Invalid hex
    })
  })

  describe('toLsn', () => {
    test('returns valid LSN unchanged', () => {
      expect(toLsn('16/3E100FA0')).toBe('16/3E100FA0')
    })

    test('throws error for invalid LSN', () => {
      expect(() => toLsn('invalid')).toThrow('not LSN invalid')
      expect(() => toLsn('16/')).toThrow('not LSN 16/')
    })
  })

  describe('LSN conversion roundtrip', () => {
    test('maintains value integrity through conversions', () => {
      const original: Lsn = '16/3E100FA0'
      const bigint = convertLsnToBigInt(original)
      const buffer = convertLsnToBuffer(original)
      const backFromBigint = convertBigIntToLsn(bigint)

      expect(backFromBigint).toBe(original)
      expect(buffer.readBigUInt64BE()).toBe(bigint)
    })
  })
})
