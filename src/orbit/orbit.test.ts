/**
 * Tests for the orbital engine.
 *
 * The propagation itself is verified against an outside source by `npm run verify:orbit` (0.79 km
 * against api.wheretheiss.at), which needs the network. What is tested here is the code around
 * it: invariants that hold for any orbit.
 */
import { describe, expect, it } from 'vitest'
import { twoline2satrec } from 'satellite.js'
import { betaAngle, groundTrack, normalizeLongitude, propagateIss, subsolarPoint } from './propagator'

/**
 * A fixed set of elements, so the tests do not depend on the network or on today's date.
 * ISS (ZARYA), epoch 2026-07-28.
 *
 * Worth knowing before writing an assertion against them: these are plausible rather than real,
 * and they place the orbit at **beta 69 degrees** — near the limit past which the plane misses
 * the Earth's shadow entirely. Anything about eclipse duration has to account for that.
 */
const TLE_LINE_1 = '1 25544U 98067A   26209.15252568  .00016717  00000+0  30074-3 0  9993'
const TLE_LINE_2 = '2 25544  51.6393 210.5107 0002140 106.5723 253.5556 15.50022337 12345'
const satrec = twoline2satrec(TLE_LINE_1, TLE_LINE_2)

describe('normalizeLongitude', () => {
  it('wraps into [-180, 180]', () => {
    expect(normalizeLongitude(0)).toBe(0)
    expect(normalizeLongitude(190)).toBeCloseTo(-170, 9)
    expect(normalizeLongitude(-190)).toBeCloseTo(170, 9)
    expect(normalizeLongitude(540)).toBeCloseTo(180, 9)
  })

  it('leaves an in-range longitude alone', () => {
    for (const value of [-179, -90, 45, 179]) {
      expect(normalizeLongitude(value)).toBeCloseTo(value, 9)
    }
  })
})

describe('propagateIss', () => {
  const date = new Date('2026-07-28T12:00:00Z')
  const state = propagateIss(satrec, date)

  it('returns a state for a valid epoch', () => {
    expect(state).not.toBeNull()
  })

  it('places the station in low Earth orbit', () => {
    expect(state!.altitude).toBeGreaterThan(380)
    expect(state!.altitude).toBeLessThan(460)
  })

  it('gives an orbital speed near 7.66 km/s', () => {
    expect(state!.speed).toBeGreaterThan(7.5)
    expect(state!.speed).toBeLessThan(7.8)
  })

  it('respects the inclination of the orbit', () => {
    // The station never flies beyond 51.6 degrees of latitude.
    for (let minutes = 0; minutes < 93; minutes += 3) {
      const step = propagateIss(satrec, new Date(date.getTime() + minutes * 60_000))
      expect(Math.abs(step!.latitude)).toBeLessThanOrEqual(52)
    }
  })

  it('completes one revolution in about 93 minutes', () => {
    expect(state!.periodMinutes).toBeGreaterThan(92)
    expect(state!.periodMinutes).toBeLessThan(94)
  })

  it('sees a footprint of roughly 2,000 km', () => {
    expect(state!.footprintKm).toBeGreaterThan(1500)
    expect(state!.footprintKm).toBeLessThan(2500)
  })

  it('reports a shadow fraction between full sun and full shadow', () => {
    expect(state!.shadow).toBeGreaterThanOrEqual(0)
    expect(state!.shadow).toBeLessThanOrEqual(1)
  })
})

describe('betaAngle', () => {
  it('stays within the geometric limit of the orbit', () => {
    // Beta cannot exceed the inclination plus the tilt of the Earth's axis: 51.6 + 23.4.
    for (let hours = 0; hours < 24 * 30; hours += 12) {
      const date = new Date(Date.UTC(2026, 6, 28) + hours * 3_600_000)
      const state = propagateIss(satrec, date)
      if (!state) continue
      expect(Math.abs(betaAngle(state, date))).toBeLessThanOrEqual(75.1)
    }
  })

  it('changes slowly, a fraction of a degree per orbit', () => {
    const first = new Date('2026-07-28T00:00:00Z')
    const later = new Date(first.getTime() + 93 * 60_000)
    const a = betaAngle(propagateIss(satrec, first)!, first)
    const b = betaAngle(propagateIss(satrec, later)!, later)

    expect(Math.abs(b - a)).toBeLessThan(2)
  })
})

describe('groundTrack', () => {
  const reference = new Date('2026-07-28T12:00:00Z')
  // A negative start reaches into the past: -45 to +45 covers one orbit centred on the moment.
  const track = groundTrack(satrec, reference, -45, 45, 30)

  it('covers the requested window', () => {
    // 90 minutes at one sample every 30 s.
    expect(track.length).toBeGreaterThan(150)
  })

  it('is centred on the reference moment', () => {
    expect(track[0].date.getTime()).toBeLessThan(reference.getTime())
    expect(track[track.length - 1].date.getTime()).toBeGreaterThan(reference.getTime())
  })

  it('runs in chronological order', () => {
    for (let i = 1; i < track.length; i++) {
      expect(track[i].date.getTime()).toBeGreaterThan(track[i - 1].date.getTime())
    }
  })

  it('keeps every longitude within [-180, 180]', () => {
    // The track crosses the antimeridian; the wrap has to be normalised, not allowed to run to
    // 181 degrees and beyond.
    for (const point of track) {
      expect(point.longitude).toBeGreaterThanOrEqual(-180)
      expect(point.longitude).toBeLessThanOrEqual(180)
      expect(Math.abs(point.latitude)).toBeLessThanOrEqual(52)
    }
  })

  it('returns nothing when the window is inverted', () => {
    expect(groundTrack(satrec, reference, 45, -45)).toEqual([])
  })

  it('carries a shadow fraction on every point', () => {
    for (const point of track) {
      expect(point.shadow).toBeGreaterThanOrEqual(0)
      expect(point.shadow).toBeLessThanOrEqual(1)
    }
  })

  it('crosses the Earth shadow exactly twice per orbit', () => {
    // One entry and one exit. More than two would mean the shadow test is flickering around its
    // threshold, which would break the track into a dashed line.
    const crossings = track.filter(
      (point, i) => i > 0 && point.shadow >= 0.5 !== track[i - 1].shadow >= 0.5,
    )
    expect(crossings).toHaveLength(2)
  })

  it('spends an eclipse fraction consistent with its beta angle', () => {
    // How much of an orbit falls in shadow depends almost entirely on the beta angle: about a
    // third near zero, shrinking to nothing past roughly 70 degrees, where the orbital plane
    // clears the Earth's shadow cone altogether. These elements sit at beta 69, so a short
    // eclipse is the correct answer — an earlier version of this test asserted a third and
    // failed, which was the test being wrong, not the code.
    const beta = Math.abs(betaAngle(propagateIss(satrec, reference)!, reference))
    const share = track.filter((point) => point.shadow >= 0.5).length / track.length

    expect(beta).toBeGreaterThan(60)
    expect(share).toBeGreaterThan(0)
    expect(share).toBeLessThan(0.2)
  })

  it('never exceeds the eclipse fraction physically possible in low orbit', () => {
    // Even at beta zero, the Earth hides the Sun for under 40 % of an orbit at this altitude.
    const share = track.filter((point) => point.shadow >= 0.5).length / track.length
    expect(share).toBeLessThan(0.4)
  })

  it('is never eclipsed while the ground below is in daylight', () => {
    // The invariant that separates a real bug from the confusing-but-correct case. The station
    // sits *above* the ground, so anything that blocks its view of the Sun blocks the ground's
    // too. The reverse is not true, and that asymmetry is what makes the map's night polygon and
    // the eclipse shading disagree — legitimately.
    const toRad = Math.PI / 180

    for (const point of track) {
      if (point.shadow < 0.5) continue
      const sun = subsolarPoint(point.date)
      const cosDistance =
        Math.sin(point.latitude * toRad) * Math.sin(sun.latitude * toRad) +
        Math.cos(point.latitude * toRad) *
          Math.cos(sun.latitude * toRad) *
          Math.cos((point.longitude - sun.longitude) * toRad)
      const groundSunElevation = 90 - (Math.acos(Math.max(-1, Math.min(1, cosDistance))) * 180) / Math.PI

      expect(
        groundSunElevation,
        `station eclipsed at ${point.latitude.toFixed(1)}, ${point.longitude.toFixed(1)} while the Sun stood ${groundSunElevation.toFixed(1)}° above the ground`,
      ).toBeLessThan(0)
    }
  })

  it('stays sunlit past the point where the ground below has gone dark', () => {
    // At 420 km the station sees the Sun after local sunset, so the shadow crossings sit inside
    // the night side rather than on the terminator. Checked by comparing the station's own
    // shadow against the Sun's elevation at the point beneath it.
    const sunlitOverDarkGround = track.filter((point) => {
      const sun = subsolarPoint(point.date)
      const angle = angularDistanceDegrees(point.latitude, point.longitude, sun.latitude, sun.longitude)
      return angle > 90 && point.shadow < 0.5
    })
    expect(sunlitOverDarkGround.length).toBeGreaterThan(0)
  })
})

/** Great-circle distance between two points, in degrees. */
function angularDistanceDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const cos =
    Math.sin(toRad(lat1)) * Math.sin(toRad(lat2)) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon1 - lon2))
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

describe('subsolar point', () => {
  // The night veil on the globe is shaded by the dot product between each surface normal and the
  // direction of the Sun, taken from this point. If it were wrong, the terminator would sit in
  // the wrong place — and on a globe drawn with unlit line materials, nothing else would betray
  // it. These check the geometry the shader depends on.

  it('sits under the Sun at local noon', () => {
    // At 12:00 UTC the Sun is over the Greenwich meridian, give or take the equation of time.
    const noon = new Date('2026-03-21T12:00:00Z')
    const sun = subsolarPoint(noon)
    expect(Math.abs(sun.longitude)).toBeLessThan(5)
  })

  it('follows the seasons', () => {
    // Near the solstices the subsolar latitude approaches the tropics, 23.44 degrees.
    const june = subsolarPoint(new Date('2026-06-21T12:00:00Z'))
    const december = subsolarPoint(new Date('2026-12-21T12:00:00Z'))

    expect(june.latitude).toBeGreaterThan(23)
    expect(december.latitude).toBeLessThan(-23)
  })

  it('travels once around the Earth in a day', () => {
    const start = subsolarPoint(new Date('2026-07-28T00:00:00Z'))
    const sixHoursLater = subsolarPoint(new Date('2026-07-28T06:00:00Z'))
    // Six hours is a quarter turn: 90 degrees westward.
    const drift = normalizeLongitude(start.longitude - sixHoursLater.longitude)
    expect(Math.abs(drift)).toBeGreaterThan(80)
    expect(Math.abs(drift)).toBeLessThan(100)
  })

  it('separates day from night at exactly 90 degrees', () => {
    // The property the map's night polygon rests on: a point 90° from the subsolar point sees the
    // Sun on the horizon, and the sign of the cosine either side says day or night.
    const date = new Date('2026-07-28T12:00:00Z')
    const sun = subsolarPoint(date)
    const toRad = Math.PI / 180

    const cosDistance = (latitude: number, longitude: number) =>
      Math.sin(latitude * toRad) * Math.sin(sun.latitude * toRad) +
      Math.cos(latitude * toRad) *
        Math.cos(sun.latitude * toRad) *
        Math.cos((longitude - sun.longitude) * toRad)

    expect(cosDistance(sun.latitude, sun.longitude)).toBeCloseTo(1, 9)
    expect(cosDistance(-sun.latitude, sun.longitude + 180)).toBeCloseTo(-1, 9)
    expect(Math.abs(cosDistance(0, sun.longitude + 90))).toBeLessThan(0.4)
  })
})
