/**
 * Tests for the Earth's placement in the 3D scene.
 *
 * The planet cannot be to scale — 6,371,000 units across in a scene whose far plane is 4,000 — so
 * something is given up, and what is kept is the **angle**. That choice is only worth anything if
 * the number is right, and the number is one line of arithmetic that would be very easy to get
 * wrong by a factor of `sin` and never notice: a horizon at 60° or at 80° both look like a horizon.
 */
import { describe, expect, it } from 'vitest'
import { ATMOSPHERE_RADIUS, EARTH_CENTRE, EARTH_RADIUS, LIMB_CHORD } from './earthLimb'
import { DISTANT_FAR, DISTANT_NEAR } from './distantScene'

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

  it('fits inside the far plane of the pass that draws it', () => {
    // The sky pass's, not the station's — they are separate frustums now, and this planet is drawn
    // by the far one. Beyond it the far side would be clipped and the limb would open up.
    expect(EARTH_CENTRE + EARTH_RADIUS).toBeLessThan(DISTANT_FAR)
  })
})

/**
 * The band of air, and the one quantity the limb shader normalises against.
 *
 * Both are scaled with the planet rather than chosen, so changing EARTH_RADIUS keeps them honest.
 */
describe('the atmosphere band', () => {
  it('stands 100 km above the surface, at the planet’s own scale', () => {
    const km = ((ATMOSPHERE_RADIUS - EARTH_RADIUS) / EARTH_RADIUS) * R
    expect(km).toBeCloseTo(100, 6)
  })

  it('is thin — under 2 % of the radius', () => {
    // The previous shell was 2.5 %, four times the height its own comment claimed. Air is thinner
    // than it looks in a render, and a shell that reads as thick reads as a rim light.
    expect((ATMOSPHERE_RADIUS - EARTH_RADIUS) / EARTH_RADIUS).toBeLessThan(0.02)
  })

  it('gives a grazing ray a path twenty times the band’s depth', () => {
    // The whole reason a limb is bright: 28 units of air, but 640 units along it. Get this wrong
    // and the arc either vanishes or turns into a halo.
    const thickness = ATMOSPHERE_RADIUS - EARTH_RADIUS
    expect(LIMB_CHORD / thickness).toBeGreaterThan(20)
    expect(LIMB_CHORD).toBeCloseTo(2 * Math.sqrt(ATMOSPHERE_RADIUS ** 2 - EARTH_RADIUS ** 2), 9)
  })

  it('stays inside the far plane along with everything else', () => {
    expect(EARTH_CENTRE + ATMOSPHERE_RADIUS).toBeLessThan(DISTANT_FAR)
    // And clear of the near plane at the other end, which the surface alone would not settle.
    expect(EARTH_CENTRE - ATMOSPHERE_RADIUS).toBeGreaterThan(DISTANT_NEAR)
  })
})
