/**
 * Two scales in one scene, and the arithmetic that reconciles them.
 *
 * The station is drawn a metre to the unit. The planet cannot be: it would be 6,371,000 units
 * across, so it is compressed until it merely *subtends* the right angle from the station — 1800
 * units of radius at 1919 of distance, which is the derivation in earthLimb. That works from one
 * point, and one point only. Move the camera and it comes apart:
 *
 *     pull back to 400 units, which is 400 metres and a sensible step away from a 94-metre object,
 *     and the horizon closes from 69.7° to 50.9°. Four hundred metres of real altitude moves it by
 *     **one hundredth of a degree**.
 *
 * The planet visibly shrinks like a beach ball when the camera backs off, which is the single
 * loudest thing in the scene saying *model* rather than *orbit*. The same fault sits on everything
 * else that is far away: the star field is a shell of radius 800, so 400 units of camera travel
 * swings it through 30° of sky, and the Sun's disc sits 600 units out, so backing off carries it
 * 41.8° across the sky while the light it casts does not move at all.
 *
 * The fix is one idea applied three times: **draw the far things from a camera that has barely
 * moved**. A second pass, its own camera, same orientation and same field of view as the real one,
 * but placed at the real camera's offset *expressed in the planet's units* — 400 metres is 0.113 of
 * them. Then the depth buffer is cleared and the station is drawn over it, at its own scale, from
 * its own camera.
 *
 * That is not an approximation of zero parallax. It is the true parallax: the far pass is the real
 * geometry under a uniform scale about the observer, and a uniform scale about the observer changes
 * no ray's direction, so the image it produces is the image the real geometry would produce.
 *
 * It also settles the thing that made a following planet impossible. Anything drawn near the camera
 * to keep its angular size would sit **in front of the station** — the planet's surface would be
 * 118.7 units away while the station is up to 400 — and no ordering of a single depth buffer can
 * have the same object both nearer and further. Two passes have two depth buffers, and the far one
 * is thrown away.
 */
import { ATMOSPHERE_RADIUS, EARTH_CENTRE, EARTH_RADIUS } from './earthLimb.ts'

/** Mean radius of the Earth in kilometres, as everywhere else in this codebase. */
const EARTH_KM = 6371

/** Kilometres in one scene unit, on the planet's compressed scale. */
export const KM_PER_EARTH_UNIT = EARTH_KM / EARTH_RADIUS

/** Kilometres in one scene unit, on the station's: it is drawn a metre to the unit. */
export const KM_PER_STATION_UNIT = 0.001

/**
 * What a step of the real camera is worth to the far camera.
 *
 * The two scales differ by a factor of 3539, so 400 units of orbit around the station — 400 metres
 * — is 0.113 units against the planet. Small, and deliberately not zero: at this distance it is
 * worth 0.0034° of parallax on the planet's centre and 0.009° on the horizon, which is what a real
 * observer stepping 400 m from the station would see, to four figures.
 */
export const PARALLAX_SCALE = KM_PER_STATION_UNIT / KM_PER_EARTH_UNIT

/**
 * The layer the far pass draws and the near pass does not.
 *
 * Layers filter lights exactly as they filter geometry, so a light left on layer 0 alone would stop
 * lighting the planet the moment the planet moved off it. Lights are therefore *enabled* on this
 * layer rather than moved to it, and stay on layer 0 for the station.
 */
export const DISTANT_LAYER = 1

/**
 * Near and far planes for the far pass, derived from what it contains.
 *
 * Nothing in it is nearer than the top of the atmosphere, 90.4 units below the station, and nothing
 * is further than the far side of that same shell. A range of 45 to 3800 rather than the 0.5 to
 * 4400 the single pass needed is a 90-fold improvement in depth resolution over the planet, which
 * is not cosmetic: the city lights are a shell 0.7 units above the surface and the clouds 3.4, and
 * at the old range the depth buffer resolved 0.44 units out there — close enough to those numbers
 * to be a z-fight waiting for a driver to round differently.
 */
export const DISTANT_NEAR = Math.floor((EARTH_CENTRE - ATMOSPHERE_RADIUS) / 2)
export const DISTANT_FAR = Math.ceil((EARTH_CENTRE + ATMOSPHERE_RADIUS + 50) / 100) * 100

/**
 * Angular radius of the planet, in degrees, seen from a camera at the given offset from the station.
 *
 * Two answers, which is the whole point of this module: what the scene used to show, and what the
 * sky actually does. `scene` places the camera against an Earth pinned to the station's origin;
 * `real` is the geometry, in kilometres, of an observer that far from the station.
 */
export function horizonAngle(cameraOffset: readonly [number, number, number]) {
  const [x, y, z] = cameraOffset

  // What one pass drew: the camera moves in station units against a planet 1919 units below.
  const sceneRange = Math.hypot(x, y + EARTH_CENTRE, z)
  const scene = Math.asin(Math.min(1, EARTH_RADIUS / sceneRange))

  // What the sky does: the same displacement in kilometres, against the real planet.
  const realRange = Math.hypot(
    x * KM_PER_STATION_UNIT,
    y * KM_PER_STATION_UNIT + EARTH_KM * (EARTH_CENTRE / EARTH_RADIUS),
    z * KM_PER_STATION_UNIT,
  )
  const real = Math.asin(Math.min(1, EARTH_KM / realRange))

  // What two passes draw: the same displacement, expressed in the planet's units.
  const passRange = Math.hypot(
    x * PARALLAX_SCALE,
    y * PARALLAX_SCALE + EARTH_CENTRE,
    z * PARALLAX_SCALE,
  )
  const pass = Math.asin(Math.min(1, EARTH_RADIUS / passRange))

  const deg = (radians: number) => (radians * 180) / Math.PI
  return { scene: deg(scene), real: deg(real), pass: deg(pass) }
}
