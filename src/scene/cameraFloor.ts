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

/**
 * Lowest the point being orbited may sit.
 *
 * The angle limit above is not enough on its own, and this took a second look to see. Panning does
 * not swing the camera around what it is looking at — it *carries both*, so a target dragged far
 * enough below takes the camera with it whatever the angle says. Measured before this existed:
 * panning down 400 units put the camera 1621 from the planet's centre, which is 179 units under the
 * ground, with the angle limit dutifully reporting 0°.
 *
 * So the target gets a floor of its own, set so that even a camera directly above it — the closest
 * a camera can be to the planet for a given target — still clears the air.
 */
export const TARGET_FLOOR = ATMOSPHERE_RADIUS + CLEARANCE - EARTH_CENTRE

/**
 * Furthest the pan may carry the target from the station.
 *
 * Not a safety limit — sideways is away from the planet's centre, so it is safe — but the same
 * clamp is the natural place for it. Without one the station can be panned clean off the screen,
 * leaving an empty black frame and no obvious way back. 150 units is a length and a half of the
 * truss: enough to put any module in the middle of the view, not enough to lose it.
 */
export const PAN_LIMIT = 150

/**
 * The target, brought back inside what the scene can render.
 *
 * Numbers in and numbers out, so it can be tested without a renderer.
 */
export function clampTarget(x: number, y: number, z: number): [number, number, number] {
  const height = Math.max(y, TARGET_FLOOR)
  const radius = Math.hypot(x, height, z)
  if (radius <= PAN_LIMIT) return [x, height, z]
  const scale = PAN_LIMIT / radius
  // Pulled back along the line to the station, then floored again: shrinking towards the origin
  // can only raise a negative height, but it can lower a positive one.
  return [x * scale, Math.max(height * scale, TARGET_FLOOR), z * scale]
}

/**
 * Far clipping plane, derived rather than chosen.
 *
 * The atmosphere is drawn back-face-first, so its *far* side is the part that must stay inside the
 * frustum. The worst case is the camera directly above a target panned as high as it may go, at the
 * end of its reach. At 4000 the shell overshot by 143 units — invisible in practice, because a
 * camera high enough to overshoot is looking down at the station with the limb well outside a 42°
 * field, but a geometry that depends on the field of view not changing is not a geometry to keep.
 */
export function farPlane(maxCameraDistance: number): number {
  const furthest = EARTH_CENTRE + PAN_LIMIT + maxCameraDistance
  return Math.ceil((furthest + ATMOSPHERE_RADIUS + 100) / 100) * 100
}
