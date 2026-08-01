/**
 * How far under the station the camera may swing before it falls into the sky.
 *
 * The scene keeps two scales at once, and this is where they collide. The station is drawn at one
 * unit per metre; the planet is compressed until it merely *subtends* the right angle, which puts
 * its surface 118.7 units below the origin to stand for 420 km. So a camera orbiting the station at
 * 400 units — four hundred metres, a sensible step back from a 94-metre object — is, in the
 * planet's units, more than a thousand kilometres. Swing it underneath and it passes through the
 * top of the air at 90.4 units and into the ground at 118.7.
 *
 * What that looked like was the whole left of the frame going flat blue: the atmosphere shell is
 * drawn back-face-first, so from inside it stops being a limb and becomes a wall.
 *
 * The fix is not a fixed angle. A fixed limit would either forbid looking up at the station's
 * underside from close in — which is a view worth having, and perfectly safe there — or allow it
 * from far out, where it is not. The limit has to know the distance, and then it says the sensible
 * thing on its own: from a few metres away you may go directly beneath, from four hundred you may
 * not, because from there "beneath" is a different continent.
 */
import { EARTH_CENTRE, ATMOSPHERE_RADIUS } from './earthLimb'

/**
 * Clearance kept between the camera and the top of the air.
 *
 * Not nought. Touching the shell is already too close: the limb shader measures a ray's path
 * through the air, and a camera on the boundary has rays that run the entire depth of it in every
 * downward direction, which washes the lower half of the frame pale before anything is technically
 * wrong.
 */
const CLEARANCE = 25

/**
 * Largest polar angle — measured from straight up — that keeps the camera clear of the atmosphere.
 *
 * Exact rather than approximate: the camera swinging out sideways also carries it further from the
 * planet's centre, and a limit that ignored that would be needlessly strict at wide angles. With
 * `d` the orbit radius, `R` the distance from the planet's centre to what the camera is orbiting,
 * and `A` the radius to stay outside, the law of cosines gives the constraint directly.
 *
 * Returns π when the whole sphere is safe, which is the honest answer close in.
 */
export function maxPolarAngle(distance: number, targetY = 0): number {
  const R = EARTH_CENTRE + targetY
  const A = ATMOSPHERE_RADIUS + CLEARANCE
  if (distance <= 0 || R <= 0) return Math.PI

  // |camera − centre|² = R² + 2·R·d·cos θ + d² ≥ A²
  const cosine = (A * A - R * R - distance * distance) / (2 * R * distance)
  if (cosine <= -1) return Math.PI
  if (cosine >= 1) return 0
  return Math.acos(cosine)
}

/** Where the top of the air sits below the station, in scene units. Exported for the tests. */
export const AIR_BELOW_STATION = EARTH_CENTRE - ATMOSPHERE_RADIUS
