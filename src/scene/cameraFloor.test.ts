/**
 * Tests for the camera's floor.
 *
 * The bug this closes was visible and ugly — swing the view under the station and the left half of
 * the frame went flat blue, because the atmosphere shell is drawn back-face-first and from inside
 * it stops being a limb and becomes a wall. What made it easy to miss is that the scene looks
 * entirely correct until the camera crosses a boundary nothing marks.
 *
 * So these assert the boundary rather than the appearance: at every distance the controls allow,
 * the furthest the camera may swing keeps it outside the air.
 */
import { describe, expect, it } from 'vitest'
import { AIR_BELOW_STATION, maxPolarAngle } from './cameraFloor'
import { ATMOSPHERE_RADIUS, EARTH_CENTRE } from './earthLimb'

/** The orbit controls' own bounds. */
const MIN_DISTANCE = 15
const MAX_DISTANCE = 400

/** Where the camera ends up, in distance from the planet's centre, at a given angle. */
function distanceFromCentre(distance: number, polar: number, targetY = -3) {
  const R = EARTH_CENTRE + targetY
  return Math.sqrt(R * R + 2 * R * distance * Math.cos(polar) + distance * distance)
}

describe('the camera floor', () => {
  it('describes the collision it exists to prevent', () => {
    // The station is drawn a metre to the unit; the planet is compressed until it merely subtends
    // the right angle. The camera may orbit out to 400 units, and the air starts at 90.
    expect(AIR_BELOW_STATION).toBeCloseTo(90.4, 1)
    expect(MAX_DISTANCE).toBeGreaterThan(AIR_BELOW_STATION)
  })

  it('keeps the camera out of the air at every distance the controls allow', () => {
    for (let distance = MIN_DISTANCE; distance <= MAX_DISTANCE; distance += 5) {
      const polar = maxPolarAngle(distance, -3)
      const reached = distanceFromCentre(distance, polar)
      expect(reached, `at ${distance} units`).toBeGreaterThanOrEqual(ATMOSPHERE_RADIUS)
    }
  })

  it('lets the camera go right under the station when it is close', () => {
    // The underside is worth looking at, and from a few metres away there is nothing to hit.
    expect(maxPolarAngle(MIN_DISTANCE, -3)).toBeCloseTo(Math.PI, 6)
    expect(maxPolarAngle(40, -3)).toBeCloseTo(Math.PI, 6)
  })

  it('tightens as the camera backs off', () => {
    // Monotone, so dragging out never suddenly frees up an angle that was refused a moment before.
    let previous = Math.PI
    for (let distance = 40; distance <= MAX_DISTANCE; distance += 10) {
      const polar = maxPolarAngle(distance, -3)
      expect(polar).toBeLessThanOrEqual(previous + 1e-12)
      previous = polar
    }
  })

  it('still allows a view from below the horizontal at the default distance', () => {
    // A floor that only permitted looking down at the station would be a worse bug than the one
    // being fixed. 105 units is where the view opens.
    const degrees = (maxPolarAngle(105, -3) * 180) / Math.PI
    expect(degrees).toBeGreaterThan(115)
    expect(degrees).toBeLessThan(180)
  })

  it('is far more careful at the far end, where a unit buys more sky', () => {
    const near = (maxPolarAngle(60, -3) * 180) / Math.PI
    const far = (maxPolarAngle(MAX_DISTANCE, -3) * 180) / Math.PI
    expect(near).toBeGreaterThan(150)
    expect(far).toBeLessThan(115)
  })

  it('answers something sane for degenerate input', () => {
    expect(maxPolarAngle(0, -3)).toBe(Math.PI)
    expect(maxPolarAngle(-10, -3)).toBe(Math.PI)
  })
})
