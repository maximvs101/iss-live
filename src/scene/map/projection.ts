/**
 * Equirectangular projection, and the day/night terminator drawn in it.
 *
 * Plate carrée: longitude maps straight to x, latitude straight to y. It distorts area badly
 * towards the poles, and it is still the right choice here — the ground track is a clean sine
 * wave in it, the whole world is visible at once, and no part of the orbit hides behind the
 * globe. This is the projection every tracking map uses, for those reasons.
 */
// The extension is spelled out, as in cameraReach, so `npm run verify:render` can import this file
// directly: Node's TypeScript support resolves nothing for a bare relative path, and this one is a
// value import rather than a type, so it does not vanish before Node sees it.
import { subsolarPoint } from '../../orbit/propagator.ts'

export interface MapSize {
  width: number
  height: number
}

/** Longitude to x, in the map's own coordinates. */
export function lonToX(longitude: number, { width }: MapSize): number {
  return ((longitude + 180) / 360) * width
}

/** Latitude to y, counted downwards from the north. */
export function latToY(latitude: number, { height }: MapSize): number {
  return ((90 - latitude) / 180) * height
}

/**
 * Direction of travel between two track points, in degrees clockwise from east — the convention
 * SVG's `rotate()` already uses, so the result can be handed to it unchanged.
 *
 * Deliberately a **screen** angle, not a great-circle bearing. The station's marker is drawn in
 * the map's flattened coordinates, and plate carrée stretches longitude near the poles; a true
 * bearing would leave the shape visibly off the track it is meant to be following.
 *
 * Longitude is wrapped first: two points either side of the antimeridian differ by ~360°, and
 * without the wrap the marker spins right round as the track crosses.
 */
export function trackHeading(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  size: MapSize,
): number {
  let deltaLon = to.longitude - from.longitude
  if (deltaLon > 180) deltaLon -= 360
  else if (deltaLon < -180) deltaLon += 360

  const dx = (deltaLon / 360) * size.width
  // Subtracted this way round, rather than negating the other, so that a due-east or due-west step
  // yields +0 instead of −0. `Math.atan2(-0, -1)` is −π where `Math.atan2(0, -1)` is +π, and due
  // west would otherwise come back as −180°: the same rotation, but a needless surprise.
  const dy = ((from.latitude - to.latitude) / 180) * size.height
  if (dx === 0 && dy === 0) return 0
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

/**
 * Latitude of the terminator at a given longitude.
 *
 * The terminator is the great circle 90° from the subsolar point, so a point (lat, lon) is on it
 * when the cosine of its angular distance to the subsolar point is zero:
 *
 *   sin(lat)·sin(lat☉) + cos(lat)·cos(lat☉)·cos(lon − lon☉) = 0
 *
 * which rearranges to the latitude below. It is undefined at the equinoxes, where the subsolar
 * latitude passes through zero and the terminator becomes a pair of meridians — hence the guard.
 */
export function terminatorLatitude(
  longitude: number,
  subsolarLatitude: number,
  subsolarLongitude: number,
): number {
  const toRad = Math.PI / 180
  const tanSun = Math.tan(subsolarLatitude * toRad)
  // Within a few thousandths of a degree of the equinox the tangent blows up; clamp rather than
  // divide by zero, which would send the curve to ±90° and tear the polygon.
  if (Math.abs(tanSun) < 1e-6) return 0
  const latitude = Math.atan(-Math.cos((longitude - subsolarLongitude) * toRad) / tanSun)
  return latitude / toRad
}

export interface NightRegion {
  /** SVG path covering the part of the map where the Sun is below the horizon. */
  path: string
  /** Where the Sun stands overhead, for the marker. */
  subsolar: { latitude: number; longitude: number }
}

/**
 * The night side, as a closed path.
 *
 * The terminator curve alone is open: it has to be closed against whichever pole is in darkness.
 * That is the pole in the opposite hemisphere from the subsolar point — in northern summer the
 * Sun never sets over the Arctic and never rises over Antarctica.
 */
export function nightRegion(date: Date, size: MapSize, steps = 240): NightRegion {
  const subsolar = subsolarPoint(date)
  const points: string[] = []

  for (let i = 0; i <= steps; i += 1) {
    const longitude = -180 + (360 * i) / steps
    const latitude = terminatorLatitude(longitude, subsolar.latitude, subsolar.longitude)
    points.push(`${lonToX(longitude, size).toFixed(2)},${latToY(latitude, size).toFixed(2)}`)
  }

  // Close towards the dark pole: south when the Sun is north of the equator, and the reverse.
  const darkPoleY = subsolar.latitude >= 0 ? size.height : 0
  const path =
    `M ${points[0]} ` +
    points.slice(1).map((p) => `L ${p}`).join(' ') +
    ` L ${size.width.toFixed(2)},${darkPoleY.toFixed(2)}` +
    ` L 0,${darkPoleY.toFixed(2)} Z`

  return { path, subsolar }
}

/**
 * Splits a sequence of geographic points wherever it crosses the antimeridian.
 *
 * Without this a track running from 179°E to 179°W draws a line straight back across the entire
 * map. Each returned run is safe to render as one polyline.
 */
export function splitAtAntimeridian<T extends { latitude: number; longitude: number }>(
  points: T[],
): T[][] {
  const runs: T[][] = []
  let current: T[] = []

  for (let i = 0; i < points.length; i += 1) {
    if (i > 0 && Math.abs(points[i].longitude - points[i - 1].longitude) > 180) {
      if (current.length > 1) runs.push(current)
      current = []
    }
    current.push(points[i])
  }
  if (current.length > 1) runs.push(current)
  return runs
}

/** Mean radius, the same figure `footprintPoints` divides by. */
const EARTH_RADIUS_KM = 6371

/**
 * Is the station above the horizon from here?
 *
 * Deliberately the *same* test the footprint circle is drawn from — central angle against
 * `radiusKm / 6371` — rather than a second calculation that happens to agree. A marker labelled
 * "visible now" while sitting outside the circle beside it would discredit both, and two
 * independent derivations of one fact is how that happens.
 */
export function withinFootprint(
  from: { latitude: number; longitude: number },
  subSatellite: { latitude: number; longitude: number },
  radiusKm: number,
): boolean {
  const toRad = Math.PI / 180
  const a = from.latitude * toRad
  const b = subSatellite.latitude * toRad
  const cosAngle =
    Math.sin(a) * Math.sin(b) +
    Math.cos(a) * Math.cos(b) * Math.cos((subSatellite.longitude - from.longitude) * toRad)
  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) <= radiusKm / EARTH_RADIUS_KM
}

/**
 * Circle of ground from which the station stands above the horizon, as map points.
 *
 * Computed on the sphere and then projected, so it comes out as the correct oval rather than the
 * plain circle a flat approximation would give.
 */
export function footprintPoints(
  latitude: number,
  longitude: number,
  radiusKm: number,
  steps = 128,
): { latitude: number; longitude: number }[] {
  const toRad = Math.PI / 180
  const angular = radiusKm / EARTH_RADIUS_KM
  const lat = latitude * toRad
  const lon = longitude * toRad
  const points: { latitude: number; longitude: number }[] = []

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * Math.PI * 2
    const sinLat = Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing)
    const pointLat = Math.asin(Math.max(-1, Math.min(1, sinLat)))
    const pointLon =
      lon +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
        Math.cos(angular) - Math.sin(lat) * Math.sin(pointLat),
      )
    points.push({
      latitude: pointLat / toRad,
      longitude: (((pointLon / toRad + 180) % 360) + 360) % 360 - 180,
    })
  }
  return points
}

/** A moment on the ground track worth marking. */
export interface TrackTick {
  latitude: number
  longitude: number
  date: Date
  /** Minutes ahead of the reference time, as a whole number. */
  minutes: number
}

/**
 * Points on the track at fixed intervals ahead, for labelling with a time.
 *
 * The track is drawn 90 minutes into the future, which is nearly a whole revolution, and a bare
 * curve says where but never *when*. Every point already carries its own date, so this costs a
 * search rather than a second propagation.
 *
 * A tick is only produced when a sample lands close to the wanted moment — the track is sampled
 * every 30 seconds, so `tolerance` guards against labelling a point a minute off, or against
 * inventing a 90-minute mark on a track that stops at 60.
 */
export function trackTicks<T extends { latitude: number; longitude: number; date: Date }>(
  track: T[],
  now: Date,
  everyMinutes = 15,
  aheadMinutes = 90,
  toleranceSeconds = 20,
): TrackTick[] {
  const ticks: TrackTick[] = []

  for (let minutes = everyMinutes; minutes <= aheadMinutes; minutes += everyMinutes) {
    const target = now.getTime() + minutes * 60_000
    let best: T | null = null
    let bestGap = Infinity

    for (const point of track) {
      const gap = Math.abs(point.date.getTime() - target)
      if (gap < bestGap) {
        bestGap = gap
        best = point
      }
    }

    if (best && bestGap <= toleranceSeconds * 1000) {
      ticks.push({ latitude: best.latitude, longitude: best.longitude, date: best.date, minutes })
    }
  }

  return ticks
}
