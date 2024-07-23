import assert from 'assert'

export class Duration {
  static ofHours(hours: number) {
    assert(hours >= 0, `hours has to be greater or equal 0`)

    return hours * 60 * 60 * 1000
  }

  static ofMinutes(minutes: number) {
    assert(minutes >= 0, `minutes has to be greater or equal 0`)

    return minutes * 60 * 1000
  }

  static ofSeconds(seconds: number) {
    assert(seconds >= 0, `seconds has to be greater or equal 0`)

    return seconds * 1000
  }

  static ofMiliseconds(miliseconds: number) {
    assert(miliseconds >= 0, `miliseconds has to be greater or equal 0`)

    return miliseconds
  }
}
