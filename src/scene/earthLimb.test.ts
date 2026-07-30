/**
 * Tests for the Earth's placement in the 3D scene.
 *
 * The planet cannot be to scale — 6,371,000 units across in a scene whose far plane is 4,000 — so
 * something is given up, and what is kept is the **angle**. That choice is only worth anything if
 * the number is right, and the number is one line of arithmetic that would be very easy to get
 * wrong by a factor of `sin` and never notice: a horizon at 60° or at 80° both look like a horizon.
 */
import { describe, expect, it } from 'vitest'
import { EARTH_CENTRE, EARTH_RADIUS } from './earthLimb'

/** Mean radius and the station's nominal altitude, in kilometres. */
const R = 6371
const H = 420

describe('the Earth limb', () => {
  it('subtends the angle the real Earth does from 420 km', () => {
    // asin(6371 / 6791) = 69.7°: the Earth covers 139° of the sky, and the horizon sits well below
    // the station rather than at its feet.
    const real = Math.asin(R / (R + H))
    const scene = Math.asin(EARTH_RADIUS / EARTH_CENTRE)
    expect((scene * 180) / Math.PI).toBeCloseTo(69.7, 1)
    expect(scene).toBeCloseTo(real, 12)
  })

  it('is not the footprint angle, which is the easy mistake', () => {
    // `acos(R / (R + h))` = 20.3° is the half-angle of the ground circle seen from Earth's centre —
    // a different quantity that the same two numbers also produce.
    const footprint = Math.acos(R / (R + H))
    const scene = Math.asin(EARTH_RADIUS / EARTH_CENTRE)
    expect(Math.abs(scene - footprint)).toBeGreaterThan(0.8)
  })

  it('leaves the station outside the planet', () => {
    // The model sits at the origin; the surface must be below it, not through it.
    expect(EARTH_CENTRE - EARTH_RADIUS).toBeGreaterThan(100)
  })

  it('fits inside the camera’s far plane', () => {
    // 4000 in StationView. Beyond it the far side would be clipped and the limb would open up.
    expect(EARTH_CENTRE + EARTH_RADIUS).toBeLessThan(4000)
  })
})
