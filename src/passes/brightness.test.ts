import { describe, expect, it } from 'vitest'
import { STANDARD_MAGNITUDE, brightnessOf, magnitude } from './brightness.ts'

describe('magnitude', () => {
  it('is the standard magnitude at 1000 km and half phase', () => {
    expect(magnitude(1000, 90)).toBeCloseTo(STANDARD_MAGNITUDE, 10)
    expect(STANDARD_MAGNITUDE).toBe(-1.8)
  })

  it('brightens by the inverse square of the distance', () => {
    // Half the distance, a quarter of the light's spread: 5·log10(0.5) = −1.505.
    expect(magnitude(500, 90)).toBeCloseTo(-1.8 - 1.50515, 4)
  })

  it('brightens towards full phase as a diffuse sphere does', () => {
    // F(0)/F(90°) = π, so 2.5·log10(π) = 1.243 brighter.
    expect(magnitude(1000, 0)).toBeCloseTo(-1.8 - 1.24287, 4)
  })

  it('stays finite with the Sun behind the station', () => {
    expect(Number.isFinite(magnitude(1000, 180))).toBe(true)
    expect(magnitude(1000, 180)).toBeGreaterThan(5)
  })
})

describe('brightnessOf', () => {
  it('cuts at −2.5 and −1', () => {
    expect(brightnessOf(-3.4)).toBe('very bright')
    expect(brightnessOf(-2.5)).toBe('very bright')
    expect(brightnessOf(-2.49)).toBe('bright')
    expect(brightnessOf(-1)).toBe('bright')
    expect(brightnessOf(-0.99)).toBe('visible but faint')
  })
})
