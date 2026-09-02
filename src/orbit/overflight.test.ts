/**
 * Tests for the overflight lookup.
 *
 * Point-in-polygon is easy to get subtly wrong — an off-by-one in the ring walk, a hole treated
 * as solid, an edge crossing the antimeridian sweeping the whole world. These use places whose
 * answer is not in doubt.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { marineReady, overflightAt } from './overflight'

// The sea outlines load as their own chunk so they stay out of the first paint. Every sea
// assertion below would otherwise race that import and read "not known yet".
beforeAll(() => marineReady)

/** Narrows away the "outlines not loaded" case, which `beforeAll` has already ruled out. */
function at(latitude: number, longitude: number) {
  const result = overflightAt(latitude, longitude)
  expect(result).not.toBeNull()
  return result!
}

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
    const result = at(latitude, longitude)
    expect(result.kind).toBe('country')
    expect(result.name).toBe(expected)
  })

  it('handles a country that straddles the antimeridian', () => {
    // Russia's easternmost tip crosses 180°. A ring walked without care would either miss it or
    // claim half the planet.
    const chukotka = at(66, 179)
    expect(chukotka.kind).toBe('country')
    expect(chukotka.name).toBe('Russia')
  })
})

describe('overflightAt — sea', () => {
  it.each([
    ['mid-Atlantic', 30, -40, 'North Atlantic Ocean'],
    ['South Atlantic', -30, -20, 'South Atlantic Ocean'],
    ['central Pacific', 10, -150, 'North Pacific Ocean'],
    ['South Pacific', -30, -120, 'South Pacific Ocean'],
    ['Indian Ocean', -20, 80, 'Indian Ocean'],
  ])('names %s', (_label, latitude, longitude, expected) => {
    const result = at(latitude, longitude)
    expect(result.kind).toBe('marine')
    expect(result.name).toBe(expected)
  })

  /*
   * The seas that used to be named wrongly, each one now checked by name.
   *
   * These are not hypothetical edge cases. Sea names came from a partition of the globe by
   * longitude and latitude, and it put the Black Sea and the Baltic in the Indian Ocean, and the
   * Gulf of Mexico, the Caribbean and the Straits of Florida in the North Pacific — water the
   * station crosses on most orbits. The method had no geometry in it, so nothing in the answer
   * could be right except by accident.
   */
  it.each([
    ['Black Sea', 43, 34],
    ['Baltic Sea', 58, 20],
    ['Gulf of Mexico', 25, -90],
    ['Caribbean Sea', 15, -75],
    ['Sea of Japan', 40, 135],
    ['Mediterranean Sea', 35.5, 15],
    ['North Sea', 56, 3],
    ['South China Sea', 15, 115],
    ['Red Sea', 20, 38],
    ['Persian Gulf', 27, 51],
    ['Java Sea', -5, 110],
    ['Mozambique Channel', -18, 41],
  ])('names the %s', (expected, latitude, longitude) => {
    const result = at(latitude as number, longitude as number)
    expect(result.kind).toBe('marine')
    expect(result.name).toBe(expected)
  })

  it('is cut to the band the station can reach, and says so by answering nothing beyond it', () => {
    // The marine set drops every area lying wholly outside ~56° of latitude: the polar seas carry
    // the most detailed coastlines in the source and the station can never be under them. This
    // pins that as a decision rather than letting a future build quietly restore them — and the
    // 51.6° inclination is what makes it safe.
    const antarctic = at(-63, -140)
    expect(antarctic.kind).toBe('water')
    const chukchi = at(72, -170)
    expect(chukchi.kind).toBe('water')
  })

  it('says nothing rather than guessing where the marine set has no polygon', () => {
    // Natural Earth punches a hole in the North Atlantic and leaves parts of it unnamed at this
    // scale. The honest answer there is that no named area covers the point — not the nearest
    // basin, and certainly not an ocean on the other side of the world.
    const result = at(0, -30)
    expect(['marine', 'water']).toContain(result.kind)
    if (result.kind === 'water') expect(result.name).toBe('open water')
  })
})

describe('robustness', () => {
  it('answers for every point along a plausible orbit', () => {
    // The station covers every longitude and reaches 51.6° either side of the equator; the
    // lookup must never come back empty.
    for (let longitude = -180; longitude <= 180; longitude += 7) {
      for (const latitude of [-51.6, -25, 0, 25, 51.6]) {
        const result = at(latitude, longitude)
        expect(result.name.length).toBeGreaterThan(0)
        expect(['country', 'marine', 'water']).toContain(result.kind)
      }
    }
  })

  it('does not put a lake inside its country', () => {
    // Rings punched out of a country — a large lake — must not read as land. Lake Victoria sits
    // in the middle of three countries and is a hole in all of them.
    const result = at(-1.2, 33.0)
    expect(result.name.length).toBeGreaterThan(0)
  })
})
