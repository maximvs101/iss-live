/**
 * Tests for which way round the planet is.
 *
 * The failure this guards against is quiet, and the first version of these tests did not catch it.
 * Eighteen assertions passed — orthonormal triads, the sub-satellite point under the station, north
 * along the ground track — while the matrix was a **reflection** and the whole map was mirrored east
 * for west. Every one of them asked the matrix a question and then graded the answer with the same
 * matrix.
 *
 * So two of the checks below are deliberately of a different kind. One is algebraic and needs no
 * scene at all: a determinant. The other asks something that knows nothing about this frame — the
 * Sun — where it is, and compares. Those are the two that would have failed.
 */
import { describe, expect, it } from 'vitest'
import { twoline2satrec } from 'satellite.js'
import {
  earthOrientationLvlh,
  propagateIss,
  subsolarPoint,
  sunDirectionLvlh,
} from '../orbit/propagator'
import { geocentric, geodetic, transform } from './earthOrientation'

/** Real elements for the ISS, from Celestrak on 28/07/2026. */
const satrec = twoline2satrec(
  '1 25544U 98067A   26209.15252568  .00010831  00000+0  20282-3 0  9992',
  '2 25544  51.6320  97.3682 0007093 345.6120  14.4666 15.49220842578109',
)

/** A whole revolution, sampled: one geometry proves nothing about a rotation. */
const SAMPLES = Array.from({ length: 16 }, (_, i) => new Date(Date.UTC(2026, 6, 28, 6, i * 6)))

/**
 * The rotation runs scene → Earth, so coming the other way means transposing it. Spelled out here
 * because feeding an Earth-frame vector to the forward map reads perfectly well and is silently the
 * inverse of what was meant — it cost 15° and a confused half-hour.
 */
const intoScene = (R: number[], v: [number, number, number]) =>
  transform([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]], v)

/** Nadir in the scene: the station is at the origin and the planet's centre is below it. */
const NADIR: [number, number, number] = [0, -1, 0]
const ZENITH: [number, number, number] = [0, 1, 0]

describe('the Earth-fixed frame', () => {
  it('is right-handed', () => {
    // Where the mirrored version showed itself, stated in one line: east of Greenwich must be at a
    // positive longitude, and under the old frame it came back negative.
    expect(geodetic(geocentric(0, 90)).longitude).toBeCloseTo(90, 9)
    expect(geodetic(geocentric(0, -90)).longitude).toBeCloseTo(-90, 9)
    const x = geocentric(0, 0)
    const y: [number, number, number] = [0, 1, 0]
    const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
    const z = geocentric(0, -90)
    expect(cross[0] * z[0] + cross[1] * z[1] + cross[2] * z[2]).toBeCloseTo(1, 9)
  })

  it('round-trips latitude and longitude', () => {
    for (const [lat, lon] of [[0, 0], [45, -73], [-33, 151], [51.6, 20], [12, 179.5], [-80, -10]]) {
      const back = geodetic(geocentric(lat, lon))
      expect(back.latitude).toBeCloseTo(lat, 9)
      expect(((back.longitude - lon + 540) % 360) - 180).toBeCloseTo(0, 9)
    }
  })
})

describe('earthOrientationLvlh', () => {
  it('is a rotation and not a reflection', () => {
    // The check that was missing. A reflection satisfies every other assertion here and mirrors the
    // planet; no amount of comparing rendered pixels against the texture can see it, because both
    // sides of that comparison go through this matrix.
    for (const when of SAMPLES) {
      const R = earthOrientationLvlh(propagateIss(satrec, when)!, when)
      const x = transform(R, [1, 0, 0])
      const y = transform(R, [0, 1, 0])
      const z = transform(R, [0, 0, 1])
      const cross: [number, number, number] = [
        x[1] * y[2] - x[2] * y[1],
        x[2] * y[0] - x[0] * y[2],
        x[0] * y[1] - x[1] * y[0],
      ]
      const determinant = cross[0] * z[0] + cross[1] * z[1] + cross[2] * z[2]
      expect(determinant, when.toISOString()).toBeCloseTo(1, 9)
    }
  })

  it('agrees with the Sun about where the Sun is', () => {
    /*
     * The second opinion, and the only assertion here that does not use this frame twice.
     *
     * The subsolar point is known by a completely separate route — the solar ephemeris and
     * Greenwich sidereal time. Place it on the globe with this rotation, and it must land where
     * `sunDirectionLvlh` independently says the Sun is.
     *
     * This is also what condemned the version that came before. That one worked from the *ground
     * track's* bearing, and a ground-track bearing is measured over a surface that is itself
     * turning while the LVLH frame is inertial. The gap is the Earth's rotation, and it read here
     * as a steady 2.5° — small enough to look like rounding, large enough to slide the texture a
     * hundred kilometres at the edge of what the station can see. Composing the two bases directly
     * brings it to zero.
     */
    for (const when of SAMPLES) {
      const state = propagateIss(satrec, when)!
      const R = earthOrientationLvlh(state, when)
      const sub = subsolarPoint(when)
      const inScene = intoScene(R, geocentric(sub.latitude, sub.longitude))
      const sun = sunDirectionLvlh(state, when)
      const dot = inScene[0] * sun[0] + inScene[1] * sun[1] + inScene[2] * sun[2]
      const degrees = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
      expect(degrees, when.toISOString()).toBeLessThan(0.01)
    }
  })

  it('puts the sub-satellite point below the station', () => {
    for (const when of SAMPLES) {
      const state = propagateIss(satrec, when)!
      const R = earthOrientationLvlh(state, when)
      const below = geodetic(transform(R, NADIR).map((v) => -v) as [number, number, number])
      // The propagator reports a geodetic latitude and this frame is geocentric, which differ by up
      // to 0.19° — the flattening, not an error. Longitude is unaffected by it.
      expect(Math.abs(below.latitude - state.latitude)).toBeLessThan(0.2)
      expect(((below.longitude - state.longitude + 540) % 360) - 180).toBeCloseTo(0, 6)
    }
  })

  it('sends the zenith to the sub-satellite point itself', () => {
    for (const when of SAMPLES) {
      const state = propagateIss(satrec, when)!
      const R = earthOrientationLvlh(state, when)
      const up = transform(R, ZENITH)
      const down = transform(R, NADIR)
      for (let i = 0; i < 3; i += 1) expect(up[i]).toBeCloseTo(-down[i], 9)
      expect(Math.hypot(...up)).toBeCloseTo(1, 9)
    }
  })

  it('puts the pole where the latitude says it is', () => {
    // A geometric fact the rotation cannot fake: seen from the station, the angle between straight
    // up and the direction of the north pole is 90° minus the latitude. A wrong roll about the
    // nadir — the one degree of freedom the sub-satellite point does not pin down — breaks it.
    for (const when of SAMPLES) {
      const state = propagateIss(satrec, when)!
      const R = earthOrientationLvlh(state, when)
      const pole = intoScene(R, [0, 1, 0])
      const fromZenith = (Math.acos(Math.max(-1, Math.min(1, pole[1]))) * 180) / Math.PI
      expect(Math.abs(fromZenith - (90 - state.latitude)), when.toISOString()).toBeLessThan(0.2)
    }
  })

  it('stays orthonormal all the way round', () => {
    for (const when of SAMPLES) {
      const R = earthOrientationLvlh(propagateIss(satrec, when)!, when)
      const axes = [
        transform(R, [1, 0, 0]),
        transform(R, [0, 1, 0]),
        transform(R, [0, 0, 1]),
      ]
      for (const axis of axes) expect(Math.hypot(...axis)).toBeCloseTo(1, 9)
      for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
        expect(axes[a][0] * axes[b][0] + axes[a][1] * axes[b][1] + axes[a][2] * axes[b][2])
          .toBeCloseTo(0, 9)
      }
    }
  })
})
