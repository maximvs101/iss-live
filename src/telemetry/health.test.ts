/**
 * Tests for stream health and the age of a measurement.
 *
 * `onboardTimestampToDate` is the one that matters most. The interface used to time age from
 * local arrival, and so announced "3 min" for readings the station had taken weeks earlier —
 * several channels re-send a month-old measurement every few seconds. Getting this wrong does
 * not throw; it quietly presents stale data as live.
 */
import { describe, expect, it } from 'vitest'
import { formatAge, onboardTimestampToDate } from './health'

/** The stream's TimeStamp is in hours since the start of the year; hour 24 is 1 January 00:00. */
const hoursFor = (date: Date) =>
  (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 3_600_000 + 24

describe('onboardTimestampToDate', () => {
  it('agrees with the onboard clock', () => {
    // Measured against TIME_000001 on 28/07/2026: 5036.2715 h and day 209.8446 are the same
    // instant, which is what pins the origin of this field.
    const now = new Date('2026-07-28T20:16:15Z')
    const date = onboardTimestampToDate('5036.271555', now)

    expect(date).not.toBeNull()
    const dayOfYear = (date!.getTime() - Date.UTC(2026, 0, 1)) / 86_400_000 + 1
    expect(dayOfYear).toBeCloseTo(209.8446, 3)
  })

  it('round-trips an arbitrary instant', () => {
    const moment = new Date('2026-03-14T09:26:53Z')
    const decoded = onboardTimestampToDate(String(hoursFor(moment)), moment)

    expect(decoded).not.toBeNull()
    expect(Math.abs(decoded!.getTime() - moment.getTime())).toBeLessThan(1000)
  })

  it('places hour 24 at 1 January 00:00 UTC', () => {
    const reference = new Date('2026-06-01T00:00:00Z')
    const decoded = onboardTimestampToDate('24', reference)

    expect(decoded!.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('reads a timestamp from the previous year when the stream crosses 1 January', () => {
    // The field carries no year. On 2 January, a timestamp late in the range belongs to the year
    // that just ended, not to a date eleven months in the future.
    const newYear = new Date('2027-01-02T12:00:00Z')
    const lateDecember = hoursFor(new Date('2026-12-31T23:00:00Z'))
    const decoded = onboardTimestampToDate(String(lateDecember), newYear)

    expect(decoded!.getUTCFullYear()).toBe(2026)
    expect(decoded!.getTime()).toBeLessThan(newYear.getTime())
  })

  it('rejects values that carry no reading', () => {
    // A timestamp of zero is not an old measurement, it is the absence of one — all eight array
    // drive currents publish exactly this.
    expect(onboardTimestampToDate('0')).toBeNull()
    expect(onboardTimestampToDate('')).toBeNull()
    expect(onboardTimestampToDate('nonsense')).toBeNull()
    expect(onboardTimestampToDate('-5')).toBeNull()
  })
})

describe('formatAge', () => {
  it('reads in whole seconds under a minute', () => {
    expect(formatAge(5_000)).toBe('5 s')
    expect(formatAge(59_999)).toBe('59 s')
  })

  it('switches to minutes, hours and days as the gap grows', () => {
    expect(formatAge(90_000)).toBe('1 min 30 s')
    expect(formatAge(3_600_000)).toBe('1 h 0 min')
    expect(formatAge(90 * 60_000)).toBe('1 h 30 min')
    expect(formatAge(26 * 3_600_000)).toBe('1 d 2 h')
  })

  it('states a month-old reading in days', () => {
    // The partial-pressure sensors sit here: 25 days, re-sent every few seconds.
    expect(formatAge(25 * 86_400_000)).toBe('25 d 0 h')
  })
})
