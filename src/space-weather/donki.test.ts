/**
 * Tests for the space weather reading.
 *
 * The classification is where this can quietly go wrong. A flare's *letter* is a decade of X-ray
 * flux and its number is only a multiplier within that decade, so any comparison that sorts on the
 * string — or reads the number first — puts C9.9 above M1.0, which is wrong by a factor of ten.
 */
import { describe, expect, it } from 'vitest'
import { flareFlux, isNotableFlare, stormScale } from './donki'

describe('flareFlux', () => {
  it('gives each class its decade', () => {
    // A is 10⁻⁸ W/m² and every letter is ten times the last.
    expect(flareFlux('A1.0')).toBeCloseTo(1e-8, 12)
    expect(flareFlux('B1.0')).toBeCloseTo(1e-7, 11)
    expect(flareFlux('C1.0')).toBeCloseTo(1e-6, 10)
    expect(flareFlux('M1.0')).toBeCloseTo(1e-5, 9)
    expect(flareFlux('X1.0')).toBeCloseTo(1e-4, 8)
  })

  it('ranks the strongest C below the weakest M', () => {
    // The comparison a string sort gets backwards, and the reason this function exists.
    expect(flareFlux('C9.9')).toBeLessThan(flareFlux('M1.0'))
    expect(flareFlux('M9.9')).toBeLessThan(flareFlux('X1.0'))
  })

  it('scales within a class', () => {
    expect(flareFlux('X10.0')).toBeCloseTo(10 * flareFlux('X1.0'), 8)
    expect(flareFlux('M5.0') / flareFlux('M1.0')).toBeCloseTo(5, 6)
  })

  it('treats a bare letter as a multiplier of one', () => {
    expect(flareFlux('X')).toBeCloseTo(1e-4, 8)
  })

  it('returns zero for anything it does not recognise', () => {
    // Reports are curated by hand; a malformed class must cost that event, not the panel.
    for (const junk of ['', 'Z1.0', '1.0', 'unknown']) expect(flareFlux(junk)).toBe(0)
  })
})

describe('isNotableFlare', () => {
  it('starts at M', () => {
    // Where a flare stops being an index and starts being a radiation dose in orbit.
    expect(isNotableFlare('M1.0')).toBe(true)
    expect(isNotableFlare('X2.2')).toBe(true)
    expect(isNotableFlare('C9.9')).toBe(false)
    expect(isNotableFlare('B4.0')).toBe(false)
  })

  it('is not fooled by case or by junk', () => {
    expect(isNotableFlare('m3.1')).toBe(true)
    expect(isNotableFlare('')).toBe(false)
  })
})

describe('stormScale', () => {
  it('follows NOAA’s G-scale boundaries', () => {
    expect(stormScale(5)?.level).toBe('G1')
    expect(stormScale(6)?.level).toBe('G2')
    expect(stormScale(7)?.level).toBe('G3')
    expect(stormScale(8)?.level).toBe('G4')
    expect(stormScale(9)?.level).toBe('G5')
  })

  it('says nothing below Kp 5', () => {
    // Not "G0": below 5 there is no storm, and inventing a level for an ordinary day would put a
    // reading on screen that NOAA would not recognise.
    expect(stormScale(4.99)).toBeNull()
    expect(stormScale(0)).toBeNull()
  })

  it('handles the fractional Kp values DONKI actually publishes', () => {
    // Kp is reported in thirds — 5.67, 7.33 — not as integers.
    expect(stormScale(5.67)?.level).toBe('G1')
    expect(stormScale(7.33)?.level).toBe('G3')
  })
})
