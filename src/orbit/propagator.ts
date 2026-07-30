/**
 * ISS orbit propagation (SGP4 model) and Sun–Earth–station geometry.
 *
 * This module is pure computation: it does not depend on the telemetry stream and therefore stays
 * fully operational even when NASA broadcasts nothing at all.
 */
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  jday,
  propagate,
  shadowFraction,
  sunPos,
  type EciVec3,
  type SatRec,
} from 'satellite.js'

export interface OrbitState {
  date: Date
  /** Degrees, positive northward. */
  latitude: number
  /** Degrees, positive eastward, wrapped into [-180, 180]. */
  longitude: number
  /** Altitude above the ellipsoid, in kilometres. */
  altitude: number
  /** Inertial speed, in km/s. */
  speed: number
  /** Inertial position (ECI, km): the basis for placement in the 3D scene. */
  eci: EciVec3<number>
  velocity: EciVec3<number>
  /** Greenwich sidereal time, used to orient the globe. */
  gmst: number
  /** Orbital period in minutes, derived from the mean elements. */
  periodMinutes: number
  /** Radius of the ground visibility circle, in kilometres. */
  footprintKm: number
  /** 0 = full sunlight, 1 = full shadow. */
  shadow: number
}

const EARTH_RADIUS_KM = 6371

/** Full state of the station at a given instant. null if the model does not converge. */
export function propagateIss(satrec: SatRec, date: Date): OrbitState | null {
  const result = propagate(satrec, date)
  if (!result?.position || !result.velocity) return null

  const gmst = gstime(date)
  const geodetic = eciToGeodetic(result.position, gmst)
  const { x, y, z } = result.velocity
  const speed = Math.sqrt(x * x + y * y + z * z)
  const altitude = geodetic.height

  return {
    date,
    latitude: degreesLat(geodetic.latitude),
    longitude: normalizeLongitude(degreesLong(geodetic.longitude)),
    altitude,
    speed,
    eci: result.position,
    velocity: result.velocity,
    gmst,
    periodMinutes: (2 * Math.PI) / result.meanElements.nm,
    footprintKm: footprintRadius(altitude),
    shadow: shadowFraction(sunPos(jday(date)).rsun, result.position),
  }
}

/** Wraps a longitude into [-180, 180]. */
export function normalizeLongitude(degrees: number): number {
  let value = degrees % 360
  if (value > 180) value -= 360
  if (value < -180) value += 360
  return value
}

/**
 * Radius of the ground circle from which the station is above the horizon.
 * This is an arc length along the Earth's surface, not a straight-line distance.
 */
function footprintRadius(altitudeKm: number): number {
  const centralAngle = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm))
  return EARTH_RADIUS_KM * centralAngle
}

export interface GroundTrackPoint {
  latitude: number
  longitude: number
  date: Date
  /**
   * 0 = full sunlight, 1 = full shadow, for the station itself rather than the ground below it.
   *
   * The two differ, and that is the point of carrying it: at 420 km the station climbs back into
   * sunlight well before the ground beneath it does, and stays lit well after local sunset. The
   * shadow crossing on the track is therefore offset from the terminator drawn on the globe.
   */
  shadow: number
}

/**
 * Ground track over a time window.
 * A negative `fromMinutes` reaches into the past: -45 to +45 covers one orbit centred on now.
 */
export function groundTrack(
  satrec: SatRec,
  reference: Date,
  fromMinutes: number,
  toMinutes: number,
  stepSeconds = 30,
): GroundTrackPoint[] {
  const points: GroundTrackPoint[] = []
  const start = reference.getTime() + fromMinutes * 60_000
  const end = reference.getTime() + toMinutes * 60_000

  for (let t = start; t <= end; t += stepSeconds * 1000) {
    const date = new Date(t)
    const result = propagate(satrec, date)
    if (!result?.position) continue
    const geodetic = eciToGeodetic(result.position, gstime(date))
    points.push({
      latitude: degreesLat(geodetic.latitude),
      longitude: normalizeLongitude(degreesLong(geodetic.longitude)),
      date,
      shadow: shadowFraction(sunPos(jday(date)).rsun, result.position),
    })
  }
  return points
}

/** Unit direction of the Sun in the inertial frame. */
export function sunDirectionEci(date: Date): EciVec3<number> {
  const { rsun } = sunPos(jday(date))
  return normalize(rsun)
}

/**
 * Beta angle: how high the Sun sits above the orbital plane, in degrees.
 *
 * This is the parameter that governs the thermal and electrical life of the station. Near 0, it
 * spends about a third of each orbit in shadow; beyond 70 degrees it stays permanently sunlit.
 * NASA publishes it too (USLAB000040): when the stream transmits again, the two values can be
 * compared.
 */
export function betaAngle(state: OrbitState, date: Date): number {
  const normal = normalize(cross(state.eci, state.velocity))
  const sun = sunDirectionEci(date)
  const sine = dot(normal, sun)
  return (Math.asin(Math.max(-1, Math.min(1, sine))) * 180) / Math.PI
}

/** True when the station is in sunlight (beyond the penumbra). */
export function isSunlit(state: OrbitState): boolean {
  return state.shadow < 0.5
}

function cross(a: EciVec3<number>, b: EciVec3<number>): EciVec3<number> {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function dot(a: EciVec3<number>, b: EciVec3<number>): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function normalize(v: EciVec3<number>): EciVec3<number> {
  const length = Math.sqrt(dot(v, v))
  if (length === 0) return { x: 0, y: 0, z: 0 }
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

/**
 * Direction of the Sun expressed in the station's frame.
 *
 * The station flies in a local frame: its belly stays towards Earth and its long axis follows the
 * direction of travel. The 3D twin's frame follows the scene convention: +X starboard, +Y zenith,
 * +Z aft — an observer at the origin looking towards -Z therefore watches the Earth stream past
 * below, as seen from the Cupola.
 *
 * Lighting the scene from this direction makes the shadow passes and the seasonal tilt of the Sun
 * appear at the right moment, with nothing simulated.
 */
export function sunDirectionLvlh(state: OrbitState, date: Date): [number, number, number] {
  const up = normalize(state.eci) // zenith direction
  const alongTrack = normalize(subtract(state.velocity, scale(up, dot(state.velocity, up))))
  const aft = scale(alongTrack, -1)
  const starboard = cross(up, aft)
  const sun = sunDirectionEci(date)
  return [dot(sun, starboard), dot(sun, up), dot(sun, aft)]
}

function subtract(a: EciVec3<number>, b: EciVec3<number>): EciVec3<number> {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function scale(v: EciVec3<number>, factor: number): EciVec3<number> {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor }
}

/** Subsolar point: latitude and longitude of the place where the Sun is at the zenith. */
export function subsolarPoint(date: Date): { latitude: number; longitude: number } {
  const sun = sunDirectionEci(date)
  const gmst = gstime(date)
  const latitude = (Math.asin(sun.z) * 180) / Math.PI
  const rightAscension = Math.atan2(sun.y, sun.x)
  const longitude = normalizeLongitude(((rightAscension - gmst) * 180) / Math.PI)
  return { latitude, longitude }
}
