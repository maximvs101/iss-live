/**
 * Tests for the flat map's projection and terminator.
 *
 * The terminator is the piece worth pinning: it is a formula with a singularity at the equinoxes
 * and a choice of which pole to close against, and getting either wrong produces a map that looks
 * plausible while shading the wrong half of the world.
 */
import { describe, expect, it } from 'vitest'
import {
  footprintPoints,
  latToY,
  lonToX,
  nightRegion,
  splitAtAntimeridian,
  terminatorLatitude,
  trackHeading,
  trackTicks,
  withinFootprint,
  type MapSize,
} from './projection'
import { subsolarPoint } from '../../orbit/propagator'

const SIZE: MapSize = { width: 720, height: 360 }

describe('equirectangular projection', () => {
  it('places the corners of the world at the corners of the map', () => {
    expect(lonToX(-180, SIZE)).toBeCloseTo(0, 6)
    expect(lonToX(180, SIZE)).toBeCloseTo(SIZE.width, 6)
    expect(latToY(90, SIZE)).toBeCloseTo(0, 6)
    expect(latToY(-90, SIZE)).toBeCloseTo(SIZE.height, 6)
  })

  it('puts the origin in the middle', () => {
    expect(lonToX(0, SIZE)).toBeCloseTo(SIZE.width / 2, 6)
    expect(latToY(0, SIZE)).toBeCloseTo(SIZE.height / 2, 6)
  })

  it('counts latitude downwards', () => {
    // North is up on a map, and y grows downwards in SVG.
    expect(latToY(45, SIZE)).toBeLessThan(latToY(-45, SIZE))
  })
})

describe('terminatorLatitude', () => {
  it('is 90 degrees from the subsolar point', () => {
    // The defining property: a point on the terminator sees the Sun exactly on the horizon.
    const subsolarLat = 20
    const subsolarLon = 40
    const toRad = Math.PI / 180

    for (const longitude of [-180, -90, -20, 0, 40, 90, 179]) {
      const latitude = terminatorLatitude(longitude, subsolarLat, subsolarLon)
      const cosDistance =
        Math.sin(latitude * toRad) * Math.sin(subsolarLat * toRad) +
        Math.cos(latitude * toRad) *
          Math.cos(subsolarLat * toRad) *
          Math.cos((longitude - subsolarLon) * toRad)
      expect(Math.abs(cosDistance)).toBeLessThan(1e-9)
    }
  })

  it('survives the equinox, where the formula divides by zero', () => {
    // With the Sun on the equator the terminator is a pair of meridians and the tangent blows up.
    // The guard has to return something finite rather than tear the polygon to the poles.
    for (const longitude of [-120, 0, 75]) {
      const latitude = terminatorLatitude(longitude, 0, 0)
      expect(Number.isFinite(latitude)).toBe(true)
      expect(Math.abs(latitude)).toBeLessThanOrEqual(90)
    }
  })

  it('stays within the latitudes of the map', () => {
    for (const sunLat of [-23, -5, 5, 23]) {
      for (let longitude = -180; longitude <= 180; longitude += 15) {
        const latitude = terminatorLatitude(longitude, sunLat, 0)
        expect(Math.abs(latitude)).toBeLessThanOrEqual(90.001)
      }
    }
  })
})

describe('nightRegion', () => {
  it('closes against the pole that is in darkness', () => {
    // Northern summer: the Sun never sets over the Arctic, so it is Antarctica that is dark and
    // the shading has to reach the bottom of the map. Closing the wrong way shades the wrong
    // hemisphere — a mistake that still produces a perfectly plausible-looking map.
    const june = nightRegion(new Date('2026-06-21T12:00:00Z'), SIZE)
    expect(june.subsolar.latitude).toBeGreaterThan(20)
    expect(june.path).toContain(`,${SIZE.height.toFixed(2)}`)

    const december = nightRegion(new Date('2026-12-21T12:00:00Z'), SIZE)
    expect(december.subsolar.latitude).toBeLessThan(-20)
    expect(december.path).toContain(',0.00')
  })

  it('spans the full width of the map', () => {
    const { path } = nightRegion(new Date('2026-07-28T12:00:00Z'), SIZE)
    expect(path.startsWith('M 0.00,')).toBe(true)
    expect(path).toContain(SIZE.width.toFixed(2))
    expect(path.endsWith('Z')).toBe(true)
  })

  it('follows the subsolar point westward through the day', () => {
    const morning = nightRegion(new Date('2026-07-28T06:00:00Z'), SIZE)
    const evening = nightRegion(new Date('2026-07-28T18:00:00Z'), SIZE)
    expect(morning.subsolar.longitude).not.toBeCloseTo(evening.subsolar.longitude, 1)
  })

  it('agrees with the propagator about where the Sun is', () => {
    const date = new Date('2026-07-28T09:30:00Z')
    const expected = subsolarPoint(date)
    const { subsolar } = nightRegion(date, SIZE)
    expect(subsolar.latitude).toBeCloseTo(expected.latitude, 9)
    expect(subsolar.longitude).toBeCloseTo(expected.longitude, 9)
  })
})

describe('splitAtAntimeridian', () => {
  it('cuts a run that wraps', () => {
    // Without the cut, a track from 179°E to 179°W draws a line back across the whole map.
    const runs = splitAtAntimeridian([
      { latitude: 0, longitude: 170 },
      { latitude: 1, longitude: 179 },
      { latitude: 2, longitude: -179 },
      { latitude: 3, longitude: -170 },
    ])
    expect(runs).toHaveLength(2)
    expect(runs[0]).toHaveLength(2)
    expect(runs[1]).toHaveLength(2)
  })

  it('leaves a continuous run alone', () => {
    const points = [
      { latitude: 0, longitude: 0 },
      { latitude: 5, longitude: 20 },
      { latitude: 10, longitude: 40 },
    ]
    expect(splitAtAntimeridian(points)).toEqual([points])
  })

  it('drops a fragment too short to draw', () => {
    const runs = splitAtAntimeridian([
      { latitude: 0, longitude: 179 },
      { latitude: 0, longitude: -179 },
    ])
    expect(runs).toEqual([])
  })
})

describe('footprintPoints', () => {
  it('encircles the point below the station', () => {
    const points = footprintPoints(0, 0, 2290)
    expect(points.length).toBeGreaterThan(50)

    // Every point sits at the same angular distance from the centre.
    const toRad = Math.PI / 180
    const expected = 2290 / 6371
    for (const point of points) {
      const cos =
        Math.sin(0) * Math.sin(point.latitude * toRad) +
        Math.cos(0) * Math.cos(point.latitude * toRad) * Math.cos(point.longitude * toRad)
      expect(Math.acos(Math.max(-1, Math.min(1, cos)))).toBeCloseTo(expected, 6)
    }
  })

  it('keeps longitudes inside the map', () => {
    // A footprint near the antimeridian wraps; the values still have to be projectable.
    for (const point of footprintPoints(45, 178, 2290)) {
      expect(point.longitude).toBeGreaterThanOrEqual(-180)
      expect(point.longitude).toBeLessThanOrEqual(180)
    }
  })
})

describe('trackHeading', () => {
  // SVG's rotate() turns clockwise on screen, and so does this: 0° is east, −90° is north.
  const at = (from: [number, number], to: [number, number]) =>
    trackHeading(
      { latitude: from[0], longitude: from[1] },
      { latitude: to[0], longitude: to[1] },
      SIZE,
    )

  it('points east, north, west and south the way the screen does', () => {
    expect(at([0, 0], [0, 10])).toBeCloseTo(0, 6)
    expect(at([0, 0], [10, 0])).toBeCloseTo(-90, 6)
    expect(at([0, 0], [0, -10])).toBeCloseTo(180, 6)
    expect(at([0, 0], [-10, 0])).toBeCloseTo(90, 6)
  })

  it('reads 45° on a 2:1 map where the steps are equal in degrees', () => {
    // Plate carrée at 720×360 gives the same pixels per degree both ways, so equal steps in
    // latitude and longitude are a true diagonal. A map of another aspect must not be.
    expect(at([0, 0], [-10, 10])).toBeCloseTo(45, 6)
    expect(trackHeading({ latitude: 0, longitude: 0 }, { latitude: -10, longitude: 10 }, { width: 720, height: 720 })).toBeCloseTo(63.435, 3)
  })

  it('does not spin the marker round at the antimeridian', () => {
    // The failure this guards: 179°E to 179°W is a step of 2° east, not 358° west. Without the
    // wrap the marker snaps through half a turn every time the track crosses.
    const crossing = at([0, 179], [0, -179])
    expect(crossing).toBeCloseTo(0, 6)
    expect(at([0, -179], [0, 179])).toBeCloseTo(180, 6)
  })

  it('matches the ground track it is drawn on', () => {
    // A northbound pass at the ISS's inclination: 51.6° means the track leans about 38° from
    // north at the equator — measured on the map, where longitude is stretched, not as a bearing.
    const step = { latitude: 0.5, longitude: 0.5 / Math.tan((51.6 * Math.PI) / 180) }
    const heading = at([0, 0], [step.latitude, step.longitude])
    expect(heading).toBeGreaterThan(-90)
    expect(heading).toBeLessThan(-30)
  })

  it('returns a stable angle when the station has not moved', () => {
    expect(at([10, 20], [10, 20])).toBe(0)
  })
})

describe('withinFootprint', () => {
  // The ISS at 420 km sees, and is seen from, a circle about 2290 km in radius.
  const RADIUS_KM = 2290
  const subSatellite = { latitude: 0, longitude: 0 }

  it('agrees with the circle it is drawn beside', () => {
    // The property that matters: a point the footprint polygon passes through must be exactly on
    // the boundary. Two derivations of one fact is how a marker ends up claiming a pass while
    // sitting outside the circle next to it.
    for (const edge of footprintPoints(0, 0, RADIUS_KM, 16)) {
      expect(withinFootprint(edge, subSatellite, RADIUS_KM + 1)).toBe(true)
      expect(withinFootprint(edge, subSatellite, RADIUS_KM - 1)).toBe(false)
    }
  })

  it('includes the ground directly beneath', () => {
    expect(withinFootprint(subSatellite, subSatellite, RADIUS_KM)).toBe(true)
  })

  it('excludes the far side of the world', () => {
    expect(withinFootprint({ latitude: 0, longitude: 180 }, subSatellite, RADIUS_KM)).toBe(false)
  })

  it('measures the great circle, not the difference in coordinates', () => {
    // 20° of longitude is 2226 km at the equator and only 1100 km at 60° N. A flat comparison of
    // degrees would call both the same, and would put half of northern Europe inside the circle.
    expect(withinFootprint({ latitude: 0, longitude: 20 }, subSatellite, RADIUS_KM)).toBe(true)
    expect(
      withinFootprint({ latitude: 60, longitude: 20 }, { latitude: 60, longitude: 0 }, 1200),
    ).toBe(true)
    expect(
      withinFootprint({ latitude: 0, longitude: 20 }, { latitude: 0, longitude: 0 }, 1200),
    ).toBe(false)
  })

  it('handles a pair either side of the antimeridian', () => {
    expect(
      withinFootprint({ latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 }, 500),
    ).toBe(true)
  })
})

describe('trackTicks', () => {
  const START = new Date('2026-07-30T12:00:00Z')
  // A track sampled every 30 seconds, as the orbit engine produces it.
  const track = Array.from({ length: 181 }, (_, i) => ({
    latitude: i * 0.1,
    longitude: i * 0.2,
    date: new Date(START.getTime() + i * 30_000),
  }))

  it('marks every quarter hour ahead', () => {
    expect(trackTicks(track, START).map((tick) => tick.minutes)).toEqual([15, 30, 45, 60, 75, 90])
  })

  it('lands on the sample nearest the wanted moment', () => {
    const [first] = trackTicks(track, START)
    expect(first.date.toISOString()).toBe('2026-07-30T12:15:00.000Z')
    expect(first.longitude).toBeCloseTo(6, 6)
  })

  it('stops where the track stops rather than inventing a mark', () => {
    // The guard that matters: a 60-minute track must not sprout a 90-minute label by falling back
    // on its own last point.
    const short = track.slice(0, 121)
    expect(trackTicks(short, START).map((tick) => tick.minutes)).toEqual([15, 30, 45, 60])
  })

  it('produces nothing for an empty track', () => {
    expect(trackTicks([], START)).toEqual([])
  })

  it('counts from the reference time, not from the track', () => {
    // The track is refreshed once a minute and the marks have to follow the clock, not the sample.
    const later = new Date(START.getTime() + 30 * 60_000)
    const ticks = trackTicks(track, later)
    expect(ticks.map((tick) => tick.minutes)).toEqual([15, 30, 45, 60])
    expect(ticks[0].date.toISOString()).toBe('2026-07-30T12:45:00.000Z')
  })
})
