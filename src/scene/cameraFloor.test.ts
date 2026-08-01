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
import {
  AIR_BELOW_STATION,
  PAN_LIMIT,
  TARGET_FLOOR,
  clampTarget,
  farPlane,
  maxPolarAngle,
} from './cameraFloor'
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

/**
 * The angle limit is not enough on its own, and this is the part that was missed the first time.
 *
 * Panning does not swing the camera around what it is looking at — it carries both. Drag the target
 * far enough down and the camera goes with it whatever the angle says. Measured before the clamp
 * existed: panning 400 units down put the camera 1621 units from the planet's centre, 179 under the
 * ground, while the angle limit sat at 0° and reported success.
 */
describe('the pan clamp', () => {
  const insideAir = (x: number, y: number, z: number) =>
    Math.hypot(x, y + EARTH_CENTRE, z) < ATMOSPHERE_RADIUS

  it('holds the target above the air', () => {
    for (const drop of [0, -50, -150, -400, -1000, -5000]) {
      const [x, y, z] = clampTarget(0, drop, 0)
      expect(insideAir(x, y, z), `panned to ${drop}`).toBe(false)
    }
  })

  it('keeps a camera directly above the target clear as well', () => {
    // The worst case for a given target: straight up is the closest the camera gets to the planet.
    for (const drop of [-100, -400, -5000]) {
      const [, y] = clampTarget(0, drop, 0)
      for (const distance of [15, 105, 400]) {
        expect(EARTH_CENTRE + y + distance).toBeGreaterThan(ATMOSPHERE_RADIUS)
      }
    }
  })

  it('leaves a target inside the allowance untouched', () => {
    expect(clampTarget(0, -3, 0)).toEqual([0, -3, 0])
    expect(clampTarget(20, 10, -30)).toEqual([20, 10, -30])
  })

  it('reels the target back in when it is panned off the station', () => {
    // Not a safety limit — sideways is away from the planet — but without it the station leaves
    // the frame and there is no obvious way back.
    const [x, y, z] = clampTarget(5000, 0, 0)
    expect(Math.hypot(x, y, z)).toBeCloseTo(PAN_LIMIT, 6)
  })

  it('does not let the reeling-in push the target under the floor', () => {
    // Shrinking towards the origin lowers a positive height, which could otherwise undo the floor.
    for (const [x, y, z] of [[3000, 400, 0], [0, 900, 3000], [-2000, 60, -2000]]) {
      const clamped = clampTarget(x, y, z)
      expect(clamped[1]).toBeGreaterThanOrEqual(TARGET_FLOOR - 1e-9)
      expect(insideAir(...clamped)).toBe(false)
    }
  })
})

describe('the far plane', () => {
  it('covers the far side of the air from the furthest the camera can get', () => {
    const furthest = EARTH_CENTRE + PAN_LIMIT + 400
    expect(farPlane(400)).toBeGreaterThan(furthest + ATMOSPHERE_RADIUS)
  })

  it('was too near before it was derived', () => {
    // 4000 was the standing value, and the shell overshot it by 143 units at full extension.
    expect(farPlane(400)).toBeGreaterThan(4000)
  })

  it('does not run away with the depth buffer', () => {
    // Precision goes with the near-to-far ratio, and the station's fine geometry lives on it.
    expect(farPlane(400) / 0.5).toBeLessThan(10000)
  })
})
