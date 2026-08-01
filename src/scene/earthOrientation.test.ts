/**
 * Tests for which way round the planet is.
 *
 * The failure this guards against is quiet. Lights in the wrong place still look like lights: a
 * plausible glow over what happens to be the Pacific, at a moment when nobody is checking the map
 * view alongside. So the assertions are the ones a wrong rotation cannot satisfy by accident —
 * the ground below the station is the ground the telemetry says it is over, and north stays north.
 */
import { describe, expect, it } from 'vitest'
import {
  earthOrientation,
  geocentric,
  geodetic,
  groundHeading,
  transform,
} from './earthOrientation'

/** Nadir in the scene: the station is at the origin and the planet's centre is below it. */
const NADIR: [number, number, number] = [0, -1, 0]
const ZENITH: [number, number, number] = [0, 1, 0]
/** The station flies along −Z; +X is starboard. */
const FORWARD: [number, number, number] = [0, 0, -1]
const STARBOARD: [number, number, number] = [1, 0, 0]

describe('groundHeading', () => {
  it('reads due north as 0 and due south as 180', () => {
    expect(groundHeading({ latitude: 0, longitude: 0 }, { latitude: 10, longitude: 0 })).toBeCloseTo(0, 6)
    expect(groundHeading({ latitude: 10, longitude: 0 }, { latitude: 0, longitude: 0 })).toBeCloseTo(180, 6)
  })

  it('reads due east as 90 at the equator', () => {
    expect(groundHeading({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 10 })).toBeCloseTo(90, 6)
  })

  it('bends a great circle away from the flat-map answer at high latitude', () => {
    // Due east on a flat map is not due east on a sphere once you leave the equator, and the
    // difference is what would tilt the texture where the ground track turns hardest.
    const bearing = groundHeading({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 40 })
    expect(bearing).toBeGreaterThan(60)
    expect(bearing).toBeLessThan(90)
  })

  it('crosses the date line without spinning round', () => {
    expect(groundHeading({ latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 })).toBeCloseTo(90, 6)
  })
})

describe('earthOrientation', () => {
  const cases = [
    { name: 'the equator at Greenwich, heading north', latitude: 0, longitude: 0, heading: 0 },
    { name: 'mid-latitude, north-east', latitude: 45, longitude: -73, heading: 52 },
    { name: 'the far side, south-east', latitude: -33, longitude: 151, heading: 118 },
    { name: 'high latitude, near the turn', latitude: 51.6, longitude: 20, heading: 88 },
    { name: 'across the date line', latitude: 12, longitude: 179.5, heading: 300 },
  ]

  for (const { name, latitude, longitude, heading } of cases) {
    it(`puts the sub-satellite point below the station — ${name}`, () => {
      const R = earthOrientation(latitude, longitude, heading)
      // Straight down from the station must land on the ground the propagator reports.
      const below = geodetic(transform(R, NADIR).map((v) => -v) as [number, number, number])
      expect(below.latitude).toBeCloseTo(latitude, 6)
      expect(((below.longitude - longitude + 540) % 360) - 180).toBeCloseTo(0, 6)
    })

    it(`keeps the rotation a rotation — ${name}`, () => {
      const R = earthOrientation(latitude, longitude, heading)
      // Orthonormal, or the texture would be stretched somewhere on the globe.
      for (const axis of [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as [number, number, number][]) {
        expect(Math.hypot(...transform(R, axis))).toBeCloseTo(1, 9)
      }
      const x = transform(R, [1, 0, 0])
      const y = transform(R, [0, 1, 0])
      expect(x[0] * y[0] + x[1] * y[1] + x[2] * y[2]).toBeCloseTo(0, 9)
    })
  }

  it('sends the zenith to the sub-satellite point itself', () => {
    const R = earthOrientation(45, -73, 52)
    const up = transform(R, ZENITH)
    const expected = geocentric(45, -73)
    for (let i = 0; i < 3; i += 1) expect(up[i]).toBeCloseTo(expected[i], 9)
  })

  it('points the ground track north when the heading is north', () => {
    // Flying due north over the equator: forward is geographic north, starboard is east.
    const R = earthOrientation(0, 0, 0)
    const forward = transform(R, FORWARD)
    const right = transform(R, STARBOARD)
    expect(geodetic(forward).latitude).toBeCloseTo(90, 6)   // the pole
    expect(geodetic(right).longitude).toBeCloseTo(90, 6)    // 90° east
  })

  it('points the ground track east when the heading is east', () => {
    const R = earthOrientation(0, 0, 90)
    const forward = transform(R, FORWARD)
    expect(geodetic(forward).latitude).toBeCloseTo(0, 6)
    expect(geodetic(forward).longitude).toBeCloseTo(90, 6)
  })

  it('turns the texture with the heading and nothing else', () => {
    // Same ground point, two headings: what is below must not move, but the direction of travel must.
    const a = earthOrientation(20, 30, 10)
    const b = earthOrientation(20, 30, 100)
    const belowA = geodetic(transform(a, NADIR).map((v) => -v) as [number, number, number])
    const belowB = geodetic(transform(b, NADIR).map((v) => -v) as [number, number, number])
    expect(belowA.latitude).toBeCloseTo(belowB.latitude, 9)
    expect(belowA.longitude).toBeCloseTo(belowB.longitude, 9)

    const forwardA = geodetic(transform(a, FORWARD))
    const forwardB = geodetic(transform(b, FORWARD))
    expect(Math.abs(forwardA.latitude - forwardB.latitude)).toBeGreaterThan(10)
  })
})
