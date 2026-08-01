/**
 * Tests for the two-scale reconciliation.
 *
 * The claim being made is strong — that the far pass shows what the sky shows, rather than
 * something close to it — so it is checked against the kilometres directly, at every distance the
 * camera can reach, and the old single-pass figure is kept alongside as the control. A test that
 * only asserted the new number is a rotation is a test that would have passed before the change.
 */
import { describe, expect, it } from 'vitest'
import {
  DISTANT_FAR,
  DISTANT_LAYER,
  DISTANT_NEAR,
  KM_PER_EARTH_UNIT,
  PARALLAX_SCALE,
  horizonAngle,
} from './distantScene'
import { ATMOSPHERE_RADIUS, EARTH_CENTRE, EARTH_RADIUS } from './earthLimb'

/** The orbit controls' reach in StationView, and the station's own half-length. */
const MAX_CAMERA_DISTANCE = 400

describe('the two scales', () => {
  it('differ by the planet’s compression and nothing else', () => {
    // 1800 units standing in for 6371 km, against a station drawn a metre to the unit.
    expect(KM_PER_EARTH_UNIT).toBeCloseTo(3.5394, 4)
    expect(PARALLAX_SCALE).toBeCloseTo(0.00028253, 8)
  })

  it('turns the camera’s whole reach into a tenth of a unit', () => {
    // The number that makes the far pass possible: four hundred metres is nothing to a planet.
    expect(MAX_CAMERA_DISTANCE * PARALLAX_SCALE).toBeCloseTo(0.113, 3)
  })
})

describe('the horizon', () => {
  it('is 69.7° from the station itself, under every scheme', () => {
    const at = horizonAngle([0, 0, 0])
    // asin(6371 / 6791), confirmed by two other routes through the same triangle.
    expect(at.real).toBeCloseTo(69.7437, 3)
    expect(at.scene).toBeCloseTo(at.real, 6)
    expect(at.pass).toBeCloseTo(at.real, 6)
  })

  it('barely moves in reality, however far the camera goes', () => {
    // 400 m of altitude at 420 km moves it by nine thousandths of a degree. This is the number
    // the scene has to match, and the one the single pass missed by two thousand times.
    const up = horizonAngle([0, MAX_CAMERA_DISTANCE, 0])
    expect(69.7437 - up.real).toBeCloseTo(0.00914, 4)
  })

  it('collapsed by nineteen degrees before the far pass existed', () => {
    // The defect, stated as a number so the fix cannot be mistaken for a refactor.
    const up = horizonAngle([0, MAX_CAMERA_DISTANCE, 0])
    expect(up.scene).toBeCloseTo(50.9, 1)
    expect(up.real - up.scene).toBeGreaterThan(18)
  })

  it('now follows the sky to a thousandth of a degree, everywhere the camera can go', () => {
    let worst = 0
    for (let distance = 15; distance <= MAX_CAMERA_DISTANCE; distance += 5) {
      for (let polar = 0; polar <= 180; polar += 6) {
        for (let azimuth = 0; azimuth < 360; azimuth += 30) {
          const p = (polar * Math.PI) / 180
          const a = (azimuth * Math.PI) / 180
          const at = horizonAngle([
            distance * Math.sin(p) * Math.cos(a),
            distance * Math.cos(p),
            distance * Math.sin(p) * Math.sin(a),
          ])
          worst = Math.max(worst, Math.abs(at.pass - at.real))
        }
      }
    }
    // Four significant figures on a quantity that used to be wrong by nineteen degrees.
    expect(worst).toBeLessThan(0.001)
  })

  it('keeps the parallax rather than throwing it away', () => {
    // Pinning the camera to the planet outright would give exactly zero, which is also wrong — the
    // real horizon does move, by a hundredth of a degree, and the far pass reproduces that.
    const still = horizonAngle([0, 0, 0])
    const back = horizonAngle([0, MAX_CAMERA_DISTANCE, 0])
    expect(still.pass - back.pass).toBeGreaterThan(0.008)
    expect(still.pass - back.pass).toBeCloseTo(still.real - back.real, 4)
  })
})

describe('the far pass’s depth range', () => {
  it('clears everything it has to draw', () => {
    // The nearest thing in it is the top of the air; the furthest is the far side of the same shell.
    expect(DISTANT_NEAR).toBeLessThan(EARTH_CENTRE - ATMOSPHERE_RADIUS)
    expect(DISTANT_FAR).toBeGreaterThan(EARTH_CENTRE + ATMOSPHERE_RADIUS)
  })

  it('is nowhere near the planet’s surface', () => {
    // A near plane that clipped the planet would cut a hole in the world, so it wants margin.
    expect(EARTH_CENTRE - EARTH_RADIUS - DISTANT_NEAR).toBeGreaterThan(50)
  })

  it('resolves the layers stacked on the surface', () => {
    // City lights sit 0.7 units above the ground and clouds 3.4. A 24-bit buffer resolves about
    // z²·(1/near − 1/far)/2^24 at distance z; at the planet that must be well under the smaller.
    const z = EARTH_CENTRE
    const resolution = (z * z * (1 / DISTANT_NEAR - 1 / DISTANT_FAR)) / 2 ** 24
    expect(resolution).toBeLessThan(0.1)

    // What the single pass gave, for comparison: the same arithmetic at 0.5 to 4400.
    const before = (z * z * (1 / 0.5 - 1 / 4400)) / 2 ** 24
    expect(before).toBeGreaterThan(0.4)
  })

  it('draws on a layer of its own', () => {
    // Zero is where everything starts, so the far pass cannot use it without taking the station too.
    expect(DISTANT_LAYER).toBeGreaterThan(0)
  })
})
