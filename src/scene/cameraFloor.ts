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
// The extension is spelled out, unlike everywhere else in src, so that `npm run verify:camera` can
// import this file directly. Node's TypeScript support resolves nothing for a bare relative path;
// the other verify scripts get away with it only because their transitive imports are type-only,
// and those vanish before Node ever sees them. Vite and tsc both accept the extension.
import { ATMOSPHERE_RADIUS, EARTH_CENTRE, EARTH_RADIUS } from './earthLimb.ts'

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
 * The first version of this took only the target's height, on the reasoning that the polar axis
 * points away from the planet and swinging out sideways can only carry the camera further from its
 * centre. That holds while the target sits directly above the centre, and stops holding the moment
 * it is panned: then straight up is no longer radial, and at the azimuth opposite the pan the
 * camera leans back towards the planet instead of away from it. The sweep found 648 positions
 * dipping 0.3 to 0.5 units into the air that way — small, but the whole point of a floor is that it
 * is not a matter of degree.
 *
 * So the limit is taken over the worst azimuth. With **T** from the planet's centre to the target,
 * `d` the orbit radius and `A` the radius to stay outside:
 *
 *     |camera − centre|² = |T|² + 2·d·(T·û) + d² ≥ A²
 *
 * and `T·û` is smallest, over the azimuths, at `|T|·cos(θ + δ)` where `δ` is how far the target has
 * been panned off the vertical. Which leaves a closed form again, and reduces to the old one when
 * nothing has been panned.
 *
 * Returns π when the whole sphere is safe, which is the honest answer close in.
 */
export function maxPolarAngle(distance: number, target: [number, number, number]): number {
  const [x, y, z] = target
  const height = EARTH_CENTRE + y
  const sideways = Math.hypot(x, z)
  const reach = Math.hypot(height, sideways)
  const A = ATMOSPHERE_RADIUS + CLEARANCE
  if (distance <= 0 || reach <= 0) return Math.PI

  const cosine = (A * A - reach * reach - distance * distance) / (2 * distance * reach)
  if (cosine <= -1) return Math.PI
  if (cosine >= 1) return 0

  // The tilt the pan introduced, subtracted because the worst azimuth leans that much further in.
  const tilt = Math.atan2(sideways, height)
  return Math.max(0, Math.acos(cosine) - tilt)
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

/** What the orbit controls are configured with, so a sweep can ask about the real reach. */
export interface CameraBounds {
  minDistance: number
  maxDistance: number
}

/**
 * Where the camera actually ends up for a requested orbit, once both clamps have had their say.
 *
 * This exists because the two rules were each correct and their *composition* was not. The angle
 * limit was written, tested and shipped while panning walked straight past it, and no test of
 * either rule alone could have noticed: the failure lives in the order they are applied and in what
 * each one is allowed to assume the other has already done.
 *
 * The order is the scene's: the target is clamped first, then the angle limit is computed from the
 * clamped target, then the controls place the camera. One caveat worth stating — the running scene
 * computes the angle limit from the camera's *current* distance, one frame behind a zoom, whereas
 * this uses the requested one. The limit tightens with distance, so the stale value can only ever
 * be looser, and for one frame.
 */
export function reachableCamera(
  request: {
    distance: number
    polar: number
    azimuth: number
    target: [number, number, number]
  },
  bounds: CameraBounds,
): { camera: [number, number, number]; target: [number, number, number] } {
  const target = clampTarget(...request.target)
  const distance = Math.min(Math.max(request.distance, bounds.minDistance), bounds.maxDistance)
  const polar = Math.min(Math.max(request.polar, 0), maxPolarAngle(distance, target))

  return {
    target,
    camera: [
      target[0] + distance * Math.sin(polar) * Math.cos(request.azimuth),
      target[1] + distance * Math.cos(polar),
      target[2] + distance * Math.sin(polar) * Math.sin(request.azimuth),
    ],
  }
}

/**
 * How much room a camera position has, in scene units, against each thing it must not be inside.
 *
 * Negative anywhere is a defect. Reported as three numbers rather than a boolean so a sweep can say
 * how close the worst case came, which is the difference between "no failures" and "no failures,
 * and the nearest miss was 25 units".
 */
export function clearances(camera: [number, number, number], far: number) {
  const fromCentre = Math.hypot(camera[0], camera[1] + EARTH_CENTRE, camera[2])
  return {
    fromCentre,
    /** Above the top of the air. */
    air: fromCentre - ATMOSPHERE_RADIUS,
    /** Above the ground, which is the same thing with more margin — kept apart to name the failure. */
    ground: fromCentre - EARTH_RADIUS,
    /** Between the far side of the atmosphere shell and the far clipping plane. */
    farPlane: far - (fromCentre + ATMOSPHERE_RADIUS),
  }
}
