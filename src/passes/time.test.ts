import { describe, expect, it } from 'vitest'
import { formatDay, formatTime } from './time.ts'

describe('time of the place observed', () => {
  it('reads Tokyo in Tokyo time whatever the browser says', () => {
    expect(formatTime(new Date('2026-09-22T11:14:00Z'), 'Asia/Tokyo')).toBe('20:14')
    expect(formatTime(new Date('2026-09-22T11:14:00Z'), 'Europe/Paris')).toBe('13:14')
  })

  it('names today and tomorrow in the local calendar, not UTC', () => {
    const now = new Date('2026-09-22T20:00:00Z') // 22:00 in Paris, 05:00 on the 23rd in Tokyo
    expect(formatDay(new Date('2026-09-22T21:30:00Z'), 'Europe/Paris', now)).toBe('Today')
    expect(formatDay(new Date('2026-09-22T22:30:00Z'), 'Europe/Paris', now)).toBe('Tomorrow')
    expect(formatDay(new Date('2026-09-24T19:00:00Z'), 'Europe/Paris', now)).toBe('Thu 24')
    expect(formatDay(new Date('2026-09-23T10:00:00Z'), 'Asia/Tokyo', now)).toBe('Today')
  })

  // Review focus 3
  it('follows the clock change', () => {
    // 25 October 2026, Paris: 03:00 CEST becomes 02:00 CET at 01:00 UTC.
    expect(formatTime(new Date('2026-10-25T00:30:00Z'), 'Europe/Paris')).toBe('02:30')
    expect(formatTime(new Date('2026-10-25T01:30:00Z'), 'Europe/Paris')).toBe('02:30')
    const now = new Date('2026-10-24T20:00:00Z')
    expect(formatDay(new Date('2026-10-25T01:30:00Z'), 'Europe/Paris', now)).toBe('Tomorrow')
  })
})
