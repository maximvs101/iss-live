import { describe, expect, it } from 'vitest'
import { formatLatitude, formatLongitude } from './coordinates'

/*
 * Four call sites used to carry their own copy of these two lines, and one of them printed a
 * different number of decimals. The behaviour they shared is pinned here once.
 */
describe('coordinates', () => {
  it('prints unsigned degrees and the hemisphere, two decimals by default', () => {
    expect(formatLatitude(51.4778)).toBe('51.48° N')
    expect(formatLatitude(-33.8688)).toBe('33.87° S')
    expect(formatLongitude(-0.0015)).toBe('0.00° W')
    expect(formatLongitude(151.2093)).toBe('151.21° E')
  })

  it('treats zero as northern and eastern', () => {
    expect(formatLatitude(0)).toBe('0.00° N')
    expect(formatLongitude(0)).toBe('0.00° E')
  })

  it('takes a coarser precision for the subsolar point', () => {
    expect(formatLatitude(-2.34, 1)).toBe('2.3° S')
    expect(formatLongitude(-179.96, 1)).toBe('180.0° W')
  })
})
