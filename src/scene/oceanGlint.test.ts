/**
 * Tests for the sea's roughness.
 *
 * A number like this is the easiest kind to get wrong and the hardest to notice: any value between
 * about 0.3 and 0.8 produces *a* bright patch on the water, and the eye has no reference for which
 * one is right. So what is asserted here is the derivation, not the appearance — the two unit
 * conversions between a measured sea slope and what three.js takes, each of which is invisible on
 * its own and lands somewhere plausible if skipped.
 */
import { describe, expect, it } from 'vitest'
import { OCEAN_ROUGHNESS, OCEAN_WIND_SPEED, seaRoughness, slopeVariance } from './oceanGlint'

describe('slopeVariance', () => {
  it('matches Cox and Munk at the wind speeds they published', () => {
    // The 1954 fit: 0.003 + 0.00512·U. Their own figures ran to about 14 m/s.
    expect(slopeVariance(0)).toBeCloseTo(0.003, 6)
    expect(slopeVariance(7)).toBeCloseTo(0.03884, 5)
    expect(slopeVariance(14)).toBeCloseTo(0.07468, 5)
  })

  it('leaves a dead calm nearly flat, but not a mirror', () => {
    // Swell persists after the wind drops, which is why the intercept is not zero.
    expect(slopeVariance(0)).toBeGreaterThan(0)
    expect(Math.sqrt(slopeVariance(0))).toBeLessThan(0.06)
  })
})

describe('seaRoughness', () => {
  it('lands where the two conversions put it', () => {
    // RMS slope 0.197 → GGX width 0.279 → perceptual 0.528. Each step alone gives a different
    // answer that still looks like water, which is the whole reason this is written down.
    expect(seaRoughness(7)).toBeCloseTo(0.528, 3)
  })

  it('is not either half-conversion', () => {
    // Stopping at the RMS slope gives 0.197; stopping at the GGX width gives 0.279. Both are
    // plausible-looking numbers to hand a material, and both are wrong.
    const rms = Math.sqrt(slopeVariance(7))
    expect(seaRoughness(7)).not.toBeCloseTo(rms, 2)
    expect(seaRoughness(7)).not.toBeCloseTo(Math.SQRT2 * rms, 2)
  })

  it('moves slowly with the weather', () => {
    // The useful property: the glint does not need the wind to be right. A flat calm and a gale
    // sit a quarter of the range apart, and everything between reads as water.
    expect(seaRoughness(2)).toBeCloseTo(0.403, 3)
    expect(seaRoughness(20)).toBeCloseTo(0.678, 3)
    expect(seaRoughness(20) - seaRoughness(2)).toBeLessThan(0.3)
  })

  it('rises with the wind', () => {
    let previous = 0
    for (let wind = 0; wind <= 25; wind += 1) {
      const roughness = seaRoughness(wind)
      expect(roughness).toBeGreaterThan(previous)
      previous = roughness
    }
  })
})

describe('what the scene uses', () => {
  it('is water, not the matte paint it was', () => {
    // 0.95 was the standing value, and near-matte has no specular lobe to speak of: no glint.
    expect(OCEAN_ROUGHNESS).toBeLessThan(0.7)
    expect(OCEAN_ROUGHNESS).toBeGreaterThan(0.3)
    expect(OCEAN_ROUGHNESS).toBe(seaRoughness(OCEAN_WIND_SPEED))
  })
})
