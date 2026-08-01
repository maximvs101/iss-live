/**
 * Tests for the limb's scattering law.
 *
 * These exist because the interesting case is nearly impossible to look at. The orange band only
 * has geometry to appear on when the station is near the terminator, which is twice an orbit; try
 * to check it at any other moment and the Sun is simply not low enough anywhere on the visible
 * horizon — measured at the time of writing, the lowest the Sun got on the whole limb was 0.21,
 * where the reddening has barely started. So a wrong threshold here would look fine all day and
 * then produce a blue sunrise, and nobody would connect the two.
 *
 * `limbShading` is the arithmetic the fragment shader runs, and the shader is built from the same
 * constants, so these assertions bind what the GPU does.
 */
import { describe, expect, it } from 'vitest'
import { groundHaze, hazeFragmentShader, limbShading } from './limbScattering'

/** Sun elevation over the air being looked at: 1 straight overhead, 0 on its horizon. */
const NOON = 0.9
const TERMINATOR = 0
const NIGHT = -0.6

/** Path length through the band: 1 grazes the ground, 0 is the top of the air. */
const GRAZING = 1
const HIGH = 0.1

describe('limbShading', () => {
  it('is brightest where the ray travels furthest through lit air', () => {
    expect(limbShading(GRAZING, NOON).intensity).toBeGreaterThan(1)
    expect(limbShading(HIGH, NOON).intensity).toBeLessThan(0.05)
  })

  it('falls off faster than the path shortens', () => {
    // Halve the path and the band loses more than half its brightness — that is what makes it a
    // band with an edge rather than a wash fading out over the whole sky.
    const full = limbShading(1, NOON).intensity
    const half = limbShading(0.5, NOON).intensity
    expect(half).toBeLessThan(full / 2)
  })

  it('gives nothing at all on the night side', () => {
    // Unlit air is not a light source. Without this the planet wears a halo all the way round,
    // which is the single clearest tell of a rim light standing in for atmosphere.
    expect(limbShading(GRAZING, NIGHT).intensity).toBe(0)
  })

  it('is still lit at the terminator, where a sunrise is', () => {
    expect(limbShading(GRAZING, TERMINATOR).intensity).toBeGreaterThan(0.5)
  })

  it('turns orange only where the Sun is low and the path is long', () => {
    const red = (depth: number, sun: number) => limbShading(depth, sun).reddening
    expect(red(GRAZING, TERMINATOR)).toBeGreaterThan(0.9)
    // High on the limb the path is short, so the light has not lost its blue.
    expect(red(HIGH, TERMINATOR)).toBeLessThan(0.05)
    // And under a high Sun it stays blue however long the path is.
    expect(red(GRAZING, NOON)).toBe(0)
  })

  it('reddens the colour it returns, not just a factor', () => {
    const [dayR, , dayB] = limbShading(GRAZING, NOON).colour
    const [sunsetR, , sunsetB] = limbShading(GRAZING, TERMINATOR).colour
    expect(dayB).toBeGreaterThan(dayR)
    expect(sunsetR).toBeGreaterThan(sunsetB)
  })

  it('changes smoothly through the terminator', () => {
    // A step here would draw a hard line across the horizon. Sampling either side of the crossing,
    // no two neighbouring elevations may jump far.
    let previous = limbShading(GRAZING, -0.5).intensity
    for (let sun = -0.48; sun <= 0.5; sun += 0.02) {
      const current = limbShading(GRAZING, sun).intensity
      expect(Math.abs(current - previous)).toBeLessThan(0.12)
      previous = current
    }
  })
})

describe('the haze between the eye and the ground', () => {
  it('is a tenth of the way to opaque straight down, and two thirds at the limb', () => {
    // Both numbers follow from the Rayleigh optical depth and the geometry, not from taste: one
    // vertical column at the nadir, 9.92 of them for a ray that just reaches the ground at the
    // horizon. If either drifts, the planet stops looking like it has air over it.
    expect(groundHaze(1, 1).opacity).toBeCloseTo(0.095, 3)
    expect(groundHaze(9.92, 1).opacity).toBeCloseTo(0.629, 3)
  })

  it('thickens with the path and never runs away', () => {
    let previous = -1
    for (const airmass of [1, 1.5, 2, 3, 5, 8, 9.92]) {
      const { opacity } = groundHaze(airmass, 1)
      expect(opacity).toBeGreaterThan(previous)
      expect(opacity).toBeLessThan(1)
      previous = opacity
    }
  })

  it('disappears on the night side', () => {
    // Unlit air scatters nothing, and a haze that survived the terminator would grey out the city
    // lights — the one place on the planet where nothing should be washed.
    expect(groundHaze(9.92, -1).opacity).toBe(0)
    expect(groundHaze(1, -1).opacity).toBe(0)
  })

  it('is the same air as the limb, reddened by the same rule', () => {
    // One function decides what lit air looks like. A second colour rule here would drift, and the
    // seam between the ground and the limb is the one place a viewer would see it.
    const long = groundHaze(9.92, -0.2)
    expect(long.reddening).toBeCloseTo(limbShading(1, -0.2).reddening, 9)
    expect(long.colour[0]).toBeGreaterThan(long.colour[2])
    const noon = groundHaze(9.92, 1)
    expect(noon.colour[2]).toBeGreaterThan(noon.colour[0])
  })

  it('puts the same constants in the shader as in the function', () => {
    // The shader is built by interpolation, so this pins that the GPU runs these numbers.
    expect(hazeFragmentShader).toContain('exp(-0.1 * airmass)')
    expect(hazeFragmentShader).toContain('(airmass - 1.0) / 8.92')
    expect(hazeFragmentShader).toContain('if (impact2 >= ground2) discard;')
  })
})
