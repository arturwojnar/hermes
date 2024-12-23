import { describe, expect, test } from '@jest/globals'
import { Duration } from './duration.js'

describe('Duration', () => {
  test('ofHours creates a Duration with correct milliseconds', () => {
    const duration = Duration.ofHours(2)
    expect(duration.value).toBe(2 * 60 * 60 * 1000)
    expect(duration.ms).toBe(2 * 60 * 60 * 1000)
  })

  test('ofMinutes creates a Duration with correct milliseconds', () => {
    const duration = Duration.ofMinutes(30)
    expect(duration.value).toBe(30 * 60 * 1000)
    expect(duration.ms).toBe(30 * 60 * 1000)
  })

  test('ofSeconds creates a Duration with correct milliseconds', () => {
    const duration = Duration.ofSeconds(45)
    expect(duration.value).toBe(45 * 1000)
    expect(duration.ms).toBe(45 * 1000)
  })

  test('ofMiliseconds creates a Duration with correct milliseconds', () => {
    const duration = Duration.ofMiliseconds(500)
    expect(duration.value).toBe(500)
    expect(duration.ms).toBe(500)
  })

  test('ofHours throws an error for negative input', () => {
    expect(() => Duration.ofHours(-1)).toThrow('hours has to be greater or equal 0')
  })

  test('ofMinutes throws an error for negative input', () => {
    expect(() => Duration.ofMinutes(-1)).toThrow('minutes has to be greater or equal 0')
  })

  test('ofSeconds throws an error for negative input', () => {
    expect(() => Duration.ofSeconds(-1)).toThrow('seconds has to be greater or equal 0')
  })

  test('ofMiliseconds throws an error for negative input', () => {
    expect(() => Duration.ofMiliseconds(-1)).toThrow('miliseconds has to be greater or equal 0')
  })
})
