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
  clearances,
  farPlane,
  maxPolarAngle,
  reachableCamera,
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
      const polar = maxPolarAngle(distance, [0, -3, 0])
      const reached = distanceFromCentre(distance, polar)
      expect(reached, `at ${distance} units`).toBeGreaterThanOrEqual(ATMOSPHERE_RADIUS)
    }
  })

  it('lets the camera go right under the station when it is close', () => {
    // The underside is worth looking at, and from a few metres away there is nothing to hit.
    expect(maxPolarAngle(MIN_DISTANCE, [0, -3, 0])).toBeCloseTo(Math.PI, 6)
    expect(maxPolarAngle(40, [0, -3, 0])).toBeCloseTo(Math.PI, 6)
  })

  it('tightens as the camera backs off', () => {
    // Monotone, so dragging out never suddenly frees up an angle that was refused a moment before.
    let previous = Math.PI
    for (let distance = 40; distance <= MAX_DISTANCE; distance += 10) {
      const polar = maxPolarAngle(distance, [0, -3, 0])
      expect(polar).toBeLessThanOrEqual(previous + 1e-12)
      previous = polar
    }
  })

  it('still allows a view from below the horizontal at the default distance', () => {
    // A floor that only permitted looking down at the station would be a worse bug than the one
    // being fixed. 105 units is where the view opens.
    const degrees = (maxPolarAngle(105, [0, -3, 0]) * 180) / Math.PI
    expect(degrees).toBeGreaterThan(115)
    expect(degrees).toBeLessThan(180)
  })

  it('is far more careful at the far end, where a unit buys more sky', () => {
    const near = (maxPolarAngle(60, [0, -3, 0]) * 180) / Math.PI
    const far = (maxPolarAngle(MAX_DISTANCE, [0, -3, 0]) * 180) / Math.PI
    expect(near).toBeGreaterThan(150)
    expect(far).toBeLessThan(115)
  })

  it('answers something sane for degenerate input', () => {
    expect(maxPolarAngle(0, [0, -3, 0])).toBe(Math.PI)
    expect(maxPolarAngle(-10, [0, -3, 0])).toBe(Math.PI)
  })

  it('tightens when the target is panned off the vertical', () => {
    // The defect the sweep found. With the target above the planet's centre, straight up is
    // radial and swinging out can only help. Pan it sideways and that stops being true: at the
    // azimuth opposite the pan the camera leans back towards the planet, and the old limit — which
    // read only the target's height — let it 0.5 units into the air.
    const centred = maxPolarAngle(400, [0, 0, 0])
    const panned = maxPolarAngle(400, [PAN_LIMIT, 0, 0])
    expect(panned).toBeLessThan(centred)
    expect(((centred - panned) * 180) / Math.PI).toBeGreaterThan(3)
  })

  it('does not care which way the pan went', () => {
    const east = maxPolarAngle(400, [PAN_LIMIT, 0, 0])
    for (const target of [
      [-PAN_LIMIT, 0, 0],
      [0, 0, PAN_LIMIT],
      [PAN_LIMIT / Math.SQRT2, 0, PAN_LIMIT / Math.SQRT2],
    ] as [number, number, number][]) {
      expect(maxPolarAngle(400, target)).toBeCloseTo(east, 9)
    }
  })
})

/**
 * The sweep, coarsened enough to run in CI.
 *
 * `npm run verify:camera` walks 293,040 positions and prints the nearest miss; this walks a tenth
 * of that and only asserts. It is here rather than only in the script because the script is manual
 * and this defect class is silent: every one of the four found so far looked like a working scene
 * until the camera crossed a boundary nothing marks.
 */
describe('every reachable camera position', () => {
  const BOUNDS = { minDistance: MIN_DISTANCE, maxDistance: MAX_DISTANCE }
  const FAR = farPlane(MAX_DISTANCE)

  it('can be drawn from', () => {
    let worst = { air: Infinity, ground: Infinity, farPlane: Infinity, at: '' }
    let samples = 0

    for (const height of [0, -3, -80, -400, -5000, 200, 3000]) {
      for (const sideways of [0, 40, 150, 5000]) {
        for (const distance of [1, 15, 105, 250, 400, 800]) {
          for (let polarDeg = 0; polarDeg <= 180; polarDeg += 10) {
            for (let azimuthDeg = 0; azimuthDeg < 360; azimuthDeg += 45) {
              const { camera } = reachableCamera(
                {
                  distance,
                  polar: (polarDeg * Math.PI) / 180,
                  azimuth: (azimuthDeg * Math.PI) / 180,
                  target: [sideways, height, 0],
                },
                BOUNDS,
              )
              const room = clearances(camera, FAR)
              samples += 1
              if (room.air < worst.air) {
                worst = { ...room, at: `pan (${sideways}, ${height}) orbit ${distance} polar ${polarDeg}° azimuth ${azimuthDeg}°` }
              }
            }
          }
        }
      }
    }

    expect(samples).toBeGreaterThan(20000)
    expect(worst.air, `nearest miss at ${worst.at}`).toBeGreaterThan(0)
    expect(worst.ground).toBeGreaterThan(0)
    expect(worst.farPlane).toBeGreaterThan(0)
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
