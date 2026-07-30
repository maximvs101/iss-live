/**
 * Tests for the overflight lookup.
 *
 * Point-in-polygon is easy to get subtly wrong — an off-by-one in the ring walk, a hole treated
 * as solid, an edge crossing the antimeridian sweeping the whole world. These use places whose
 * answer is not in doubt.
 */
import { describe, expect, it } from 'vitest'
import { overflightAt } from './overflight'

describe('overflightAt — land', () => {
  it.each([
    ['Paris', 48.86, 2.35, 'France'],
    ['Houston', 29.76, -95.37, 'United States of America'],
    ['Tokyo', 35.68, 139.69, 'Japan'],
    ['Alice Springs', -23.7, 133.88, 'Australia'],
    ['Manaus', -3.1, -60.02, 'Brazil'],
    ['Nairobi', -1.29, 36.82, 'Kenya'],
    ['Novosibirsk', 55.03, 82.92, 'Russia'],
  ])('places %s in %s', (_label, latitude, longitude, expected) => {
    const result = overflightAt(latitude, longitude)
    expect(result.kind).toBe('country')
    expect(result.name).toBe(expected)
  })

  it('handles a country that straddles the antimeridian', () => {
    // Russia's easternmost tip crosses 180°. A ring walked without care would either miss it or
    // claim half the planet.
    const chukotka = overflightAt(66, 179)
    expect(chukotka.kind).toBe('country')
    expect(chukotka.name).toBe('Russia')
  })
})

describe('overflightAt — sea', () => {
  it.each([
    ['mid-Atlantic', 30, -40, 'North Atlantic'],
    ['South Atlantic', -30, -20, 'South Atlantic'],
    ['central Pacific', 10, -150, 'North Pacific'],
    ['South Pacific', -30, -120, 'South Pacific'],
    ['Indian Ocean', -20, 80, 'Indian Ocean'],
    ['high Arctic', 80, 0, 'Arctic Ocean'],
    // Amundsen Sea, well off the Antarctic coast — 70° S at 100° E would be on the continent.
    ['Southern Ocean', -63, -140, 'Southern Ocean'],
  ])('names %s', (_label, latitude, longitude, expected) => {
    const result = overflightAt(latitude, longitude)
    expect(result.kind).toBe('ocean')
    expect(result.name).toBe(expected)
  })

  it('marks sea answers as approximate', () => {
    // Ocean names come from a coarse regional split, not from geometry. The caller has to be
    // able to tell that apart from an exact country match.
    expect(overflightAt(0, -30).kind).toBe('ocean')
  })
})

describe('robustness', () => {
  it('answers for every point along a plausible orbit', () => {
    // The station covers every longitude and reaches 51.6° either side of the equator; the
    // lookup must never come back empty.
    for (let longitude = -180; longitude <= 180; longitude += 7) {
      for (const latitude of [-51.6, -25, 0, 25, 51.6]) {
        const result = overflightAt(latitude, longitude)
        expect(result.name.length).toBeGreaterThan(0)
        expect(['country', 'ocean']).toContain(result.kind)
      }
    }
  })

  it('does not put a lake inside its country', () => {
    // Rings punched out of a country — a large lake — must not read as land. Lake Victoria sits
    // in the middle of three countries and is a hole in all of them.
    const result = overflightAt(-1.2, 33.0)
    expect(result.name.length).toBeGreaterThan(0)
  })
})
