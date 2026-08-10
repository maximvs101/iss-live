/**
 * Upcoming passes of the station over a given place.
 *
 * A pass is a window during which the station rises above the observer's horizon. Whether it can
 * actually be *seen* is a stricter question, and it takes three conditions at once:
 *
 *  1. the station is high enough above the horizon to clear buildings and haze;
 *  2. the station is in sunlight — it shines by reflection, nothing else;
 *  3. the observer is in darkness, otherwise the sky outshines it.
 *
 * That combination is why visible passes cluster in the hours after dusk and before dawn.
 *
 * Everything here is computed from the orbital elements. It works with no telemetry at all.
 */
import {
  degreesToRadians,
  ecfToEci,
  ecfToLookAngles,
  eciToEcf,
  geodeticToEcf,
  gstime,
  jday,
  propagate,
  radiansToDegrees,
  shadowFraction,
  sunPos,
  type EciVec3,
  type SatRec,
} from 'satellite.js'

/** Astronomical unit, to convert the Sun position returned by satellite.js into kilometres. */
const AU_KM = 149_597_870.7

/**
 * Standard magnitude of the ISS: its brightness at 1000 km with the Sun behind the observer.
 * Widely used value since the arrays were extended; the derived magnitudes stay estimates.
 */
const ISS_STANDARD_MAGNITUDE = -1.8

/** Below this Sun elevation the sky is dark enough for the station to stand out. */
const DARK_SKY_SUN_ELEVATION = -6

export interface Observer {
  /** Degrees, positive north. */
  latitude: number
  /** Degrees, positive east. */
  longitude: number
  /** Metres above sea level. */
  altitudeM?: number
  label?: string
}

interface PassPoint {
  date: Date
  /** Degrees from north, clockwise. */
  azimuth: number
  /** Degrees above the horizon. */
  elevation: number
  rangeKm: number
  /** True when the station is lit by the Sun at that moment. */
  sunlit: boolean
  /** Elevation of the Sun for the observer, in degrees. Negative means night. */
  sunElevation: number
  /** Estimated visual magnitude; lower is brighter. null when the station is in shadow. */
  magnitude: number | null
}

export interface Pass {
  /** Rise: the moment the station crosses the minimum elevation. */
  start: PassPoint
  /** Highest point of the pass. */
  culmination: PassPoint
  /** Set. */
  end: PassPoint
  durationSeconds: number
  maxElevation: number
  /** True when the pass is observable with the naked eye. */
  visible: boolean
  /** Brightest estimated magnitude during the visible portion. */
  brightestMagnitude: number | null
}

export interface PassOptions {
  /** Search window, in hours. */
  hours?: number
  /** Minimum elevation for a pass to count, in degrees. */
  minElevation?: number
  /** Sampling step, in seconds. Sets the precision of rise and set times. */
  stepSeconds?: number
}

/** Compass point for an azimuth, the way an observer would describe it. */
export function compassPoint(azimuth: number): string {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return points[Math.round(((azimuth % 360) + 360) % 360 / 22.5) % 16]
}

/** Sun position in the inertial frame, in kilometres. */
function sunEci(date: Date): EciVec3<number> {
  const { rsun } = sunPos(jday(date))
  return { x: rsun.x * AU_KM, y: rsun.y * AU_KM, z: rsun.z * AU_KM }
}

/**
 * Estimated visual magnitude.
 *
 * Brightness falls off with distance, and with the phase angle — the Sun–station–observer angle,
 * which says how much of the lit side faces the observer. A fully lit station overhead is far
 * brighter than a crescent one low on the horizon.
 */
function estimateMagnitude(rangeKm: number, phaseAngleRad: number): number {
  const phaseFactor = (1 + Math.cos(phaseAngleRad)) / 2
  // Guard against the exactly-back-lit case, where the factor reaches zero.
  const illuminated = Math.max(phaseFactor, 1e-4)
  return ISS_STANDARD_MAGNITUDE + 5 * Math.log10(rangeKm / 1000) - 2.5 * Math.log10(illuminated)
}

function angleBetween(a: EciVec3<number>, b: EciVec3<number>): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z
  const lenA = Math.hypot(a.x, a.y, a.z)
  const lenB = Math.hypot(b.x, b.y, b.z)
  if (lenA === 0 || lenB === 0) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / (lenA * lenB))))
}

/** Full geometry of one instant, as seen from the observer. */
function sample(satrec: SatRec, observer: Observer, date: Date): PassPoint | null {
  const result = propagate(satrec, date)
  if (!result?.position) return null

  const gmst = gstime(date)
  const observerGd = {
    latitude: degreesToRadians(observer.latitude),
    longitude: degreesToRadians(observer.longitude),
    height: (observer.altitudeM ?? 0) / 1000,
  }

  const satelliteEcf = eciToEcf(result.position, gmst)
  const look = ecfToLookAngles(observerGd, satelliteEcf)

  const sun = sunEci(date)
  const sunLook = ecfToLookAngles(observerGd, eciToEcf(sun, gmst))
  const sunElevation = radiansToDegrees(sunLook.elevation)

  const sunlit = shadowFraction(sunPos(jday(date)).rsun, result.position) < 0.5

  // Phase angle at the station: between its direction to the Sun and its direction to the
  // observer. Both vectors are built in the inertial frame, so the observer is converted from
  // geodetic to ECF and then to ECI.
  const observerEci = ecfToEci(geodeticToEcf(observerGd), gmst)
  const toSun = {
    x: sun.x - result.position.x,
    y: sun.y - result.position.y,
    z: sun.z - result.position.z,
  }
  const toObserver = {
    x: observerEci.x - result.position.x,
    y: observerEci.y - result.position.y,
    z: observerEci.z - result.position.z,
  }

  const elevation = radiansToDegrees(look.elevation)
  const rangeKm = look.rangeSat

  return {
    date,
    azimuth: radiansToDegrees(look.azimuth),
    elevation,
    rangeKm,
    sunlit,
    sunElevation,
    magnitude: sunlit ? estimateMagnitude(rangeKm, angleBetween(toSun, toObserver)) : null,
  }
}

/**
 * Finds the passes over the observer within the search window.
 *
 * The search steps through time and watches the elevation cross the threshold. The step size sets
 * how precisely rise and set times are pinned down: 15 seconds is plenty, since a pass lasts
 * several minutes.
 */
export function findPasses(
  satrec: SatRec,
  observer: Observer,
  from: Date,
  { hours = 72, minElevation = 10, stepSeconds = 15 }: PassOptions = {},
): Pass[] {
  const passes: Pass[] = []
  const end = from.getTime() + hours * 3_600_000

  let current: PassPoint[] | null = null

  /**
   * A run of one sample is not a pass, it is the sampling grid clipping a corner.
   *
   * The station was above the threshold for less than one step — under 15 seconds — and only one
   * moment of it was looked at, so rise, culmination and set all collapse onto that single point.
   * What came out was a pass reading `12:37:24 → 12:37:24, ESE→ESE, 0 min`: a duration of zero and
   * a set bearing identical to the rise, which is not a marginal pass reported honestly but an
   * event with no measured extent at all.
   *
   * Discarding it loses nothing anyone could act on. Something grazing 11° for a few seconds is not
   * a pass to go outside for, and its rise and set times are unknown rather than equal — the search
   * never looked between them.
   */
  const record = (run: PassPoint[]) => {
    if (run.length >= 2) passes.push(buildPass(run))
  }

  for (let t = from.getTime(); t <= end; t += stepSeconds * 1000) {
    const point = sample(satrec, observer, new Date(t))
    if (!point) continue

    if (point.elevation >= minElevation) {
      if (!current) current = []
      current.push(point)
      continue
    }

    if (current) {
      record(current)
      current = null
    }
  }

  if (current) record(current)
  return passes
}

function buildPass(points: PassPoint[]): Pass {
  const culmination = points.reduce((best, point) => (point.elevation > best.elevation ? point : best))
  const start = points[0]
  const finish = points[points.length - 1]

  // Visible means: high enough, station in sunlight, observer in darkness — all at the same moment.
  const visiblePoints = points.filter(
    (point) => point.sunlit && point.sunElevation < DARK_SKY_SUN_ELEVATION,
  )
  const magnitudes = visiblePoints
    .map((point) => point.magnitude)
    .filter((value): value is number => value !== null)

  return {
    start,
    culmination,
    end: finish,
    durationSeconds: (finish.date.getTime() - start.date.getTime()) / 1000,
    maxElevation: culmination.elevation,
    visible: visiblePoints.length > 0,
    brightestMagnitude: magnitudes.length > 0 ? Math.min(...magnitudes) : null,
  }
}
