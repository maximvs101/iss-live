/**
 * Tests for what the camera can reach, and for the floor that no longer has to exist.
 *
 * The history matters here, because the shape of these tests is the shape of four defects. A user
 * sent a screenshot of the frame going flat blue when the view swung under the station: the camera
 * had passed through the atmosphere shell, which is drawn back-face-first and so becomes a wall
 * from inside. Fixing that took a distance-aware polar limit; then sweeping the *rest* of the
 * extremes found that panning walks straight past a polar limit, and then that the limit read only
 * the target's height and so was wrong whenever the target had been panned sideways.
 *
 * All four had one cause — the planet was pinned to the station's origin, so the camera's 400 units
 * of orbit were 400 units against a surface 118.7 below. The sky pass makes those 400 units worth
 * 0.113, and every one of the four becomes unreachable. That is what the sweep at the bottom
 * checks, and it checks it against the *old* geometry as a control, so a regression that quietly
 * restored the single pass would fail rather than pass in silence.
 */
import { describe, expect, it } from 'vitest'
import {
  PAN_LIMIT,
  STATION_RADIUS,
  clampTarget,
  clearances,
  farPlane,
  reachableCamera,
} from './cameraReach'
import { ATMOSPHERE_RADIUS, EARTH_CENTRE } from './earthLimb'
import { PARALLAX_SCALE } from './distantScene'

const BOUNDS = { minDistance: 15, maxDistance: 400 }
const FAR = farPlane(BOUNDS.maxDistance)

describe('the pan clamp', () => {
  it('leaves a target inside the allowance untouched', () => {
    expect(clampTarget(10, -3, 40)).toEqual([10, -3, 40])
  })

  it('reels the target back in when it is panned off the station', () => {
    const [x, y, z] = clampTarget(0, -400, 0)
    expect(Math.hypot(x, y, z)).toBeCloseTo(PAN_LIMIT, 9)
    expect(y).toBeCloseTo(-PAN_LIMIT, 9)
  })

  it('no longer holds the target above the planet', () => {
    // It used to, and had to: a target dragged down carried the camera into the ground with it.
    // Now down is only down, and this is the assertion that says the floor really is gone.
    const [, y] = clampTarget(0, -140, 0)
    expect(y).toBe(-140)
  })

  it('does not care which way the pan went', () => {
    const up = clampTarget(0, 400, 0)
    const down = clampTarget(0, -400, 0)
    expect(up[1]).toBeCloseTo(-down[1], 9)
  })
})

describe('the near pass’s far plane', () => {
  it('covers the far corner of the station from the end of the camera’s reach', () => {
    expect(FAR).toBeGreaterThan(BOUNDS.maxDistance + PAN_LIMIT + STATION_RADIUS)
  })

  it('is a fraction of what a single pass needed', () => {
    // 4400 was the derived figure while the planet shared this frustum. Six times less range means
    // roughly six times the depth resolution over the station, which is where the fine geometry is.
    expect(FAR).toBeLessThan(1000)
    expect(4400 / FAR).toBeGreaterThan(5)
  })
})

describe('every reachable camera position', () => {
  const angles = Array.from({ length: 37 }, (_, i) => (i * Math.PI) / 18)
  const targets: [number, number, number][] = [
    [0, -3, 0],
    [0, -PAN_LIMIT, 0],
    [PAN_LIMIT, 0, 0],
    [0, PAN_LIMIT, 0],
    [-90, -90, -60],
  ]

  it('leaves the sky pass outside the air, including straight underneath', () => {
    let worstAir = Infinity
    let worstFar = Infinity
    let count = 0

    for (const distance of [15, 40, 105, 250, 400]) {
      for (const polar of angles) {
        for (const azimuth of angles) {
          for (const target of targets) {
            const { camera } = reachableCamera({ distance, polar, azimuth, target }, BOUNDS)
            const room = clearances(camera, FAR)
            worstAir = Math.min(worstAir, room.air)
            worstFar = Math.min(worstFar, room.farPlane)
            count += 1
          }
        }
      }
    }

    expect(count).toBeGreaterThan(30_000)
    // 90.4 units is the clearance from the station itself; the camera's whole reach costs 0.1 of it.
    expect(worstAir).toBeGreaterThan(90)
    expect(worstFar).toBeGreaterThan(0)
  })

  it('would have been inside the air under the old arrangement', () => {
    // The control. Same position, planet pinned to the origin: this is the screenshot the user sent.
    const { camera } = reachableCamera(
      { distance: 400, polar: Math.PI, azimuth: 0, target: [0, -3, 0] },
      BOUNDS,
    )
    const pinned = Math.hypot(camera[0], camera[1] + EARTH_CENTRE, camera[2])
    expect(pinned - ATMOSPHERE_RADIUS).toBeLessThan(0)

    // And is ninety units clear of it now.
    expect(clearances(camera, FAR).air).toBeGreaterThan(90)
  })

  it('costs the sky camera a tenth of a unit to cross the whole scene', () => {
    // Why the sweep above is not really about angles any more: the sky pass's camera never goes
    // anywhere. Stated as a number so a change to the scale factor cannot pass unnoticed.
    expect(BOUNDS.maxDistance * PARALLAX_SCALE).toBeLessThan(0.12)
  })
})
