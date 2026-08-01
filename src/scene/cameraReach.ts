/**
 * How far the camera may go, and what has to fit in the frustum when it gets there.
 *
 * This file used to be `cameraFloor`, and most of it was a floor: a distance-aware polar limit, a
 * height clamp on the pan target, and a sweep to prove the two composed. All of that existed to
 * stop the camera swinging under the station and into the atmosphere shell, which happened because
 * the planet was pinned to the station's origin with its surface only 118.7 units below — so 400
 * units of orbit, four hundred metres, carried the camera through the sky and out the other side.
 *
 * The sky is now drawn in its own pass, from a camera that converts those 400 units into 0.113 of
 * the planet's own (see distantScene). It cannot reach the air, at any angle, from any distance:
 * the closest it comes is 90.3 units, against 90.4 from the station itself. **So the floor is gone
 * — not disabled, removed** — and with it the one view it had to forbid: the station seen from
 * directly underneath, silhouetted against the Earth, which was the whole reason anyone swung the
 * camera under there in the first place.
 *
 * What is left is a usability clamp on panning, and a far plane that now has only the station to
 * cover.
 */
// The extension is spelled out, unlike everywhere else in src, so that `npm run verify:camera` can
// import this file directly. Node's TypeScript support resolves nothing for a bare relative path;
// the other verify scripts get away with it only because their transitive imports are type-only,
// and those vanish before Node ever sees them. Vite and tsc both accept the extension.
import { ATMOSPHERE_RADIUS, EARTH_CENTRE } from './earthLimb.ts'
import { PARALLAX_SCALE } from './distantScene.ts'

/**
 * Furthest the pan may carry the target from the station.
 *
 * Not a safety limit any more — nothing under the station is dangerous now — but without one the
 * station can be panned clean off the screen, leaving an empty black frame and no obvious way back.
 * 150 units is a length and a half of the truss: enough to put any module in the middle of the
 * view, not enough to lose it.
 */
export const PAN_LIMIT = 150

/**
 * Radius of a sphere about the station's centre that holds all of it.
 *
 * The same figure the shadow camera is sized from: 94 m of truss and 73 m of arrays put half the
 * diagonal of the footprint at 59.5 m, and 62 covers every corner with a little to spare.
 */
export const STATION_RADIUS = 62

/** The target, brought back inside what the scene can render. Numbers in, numbers out. */
export function clampTarget(x: number, y: number, z: number): [number, number, number] {
  const radius = Math.hypot(x, y, z)
  if (radius <= PAN_LIMIT) return [x, y, z]
  const scale = PAN_LIMIT / radius
  return [x * scale, y * scale, z * scale]
}

/**
 * Far clipping plane for the near pass, derived rather than chosen.
 *
 * The near pass draws the station and nothing else, so the furthest it has to reach is the far
 * corner of the station from a camera at the end of its orbit around a target panned as far as it
 * may go. That is 700 rather than the 4400 the single pass needed in order to swallow a planet, and
 * the gain is not cosmetic: depth resolution goes as the square of the range.
 */
export function farPlane(maxCameraDistance: number): number {
  const furthest = maxCameraDistance + PAN_LIMIT + STATION_RADIUS
  return Math.ceil((furthest + 50) / 100) * 100
}

/** What the orbit controls are configured with, so a sweep can ask about the real reach. */
export interface CameraBounds {
  minDistance: number
  maxDistance: number
}

/**
 * Where the camera ends up for a requested orbit, once the clamp has had its say.
 *
 * Kept, though it is now much simpler than the version that had two rules to compose, because the
 * sweep it feeds is what found three of the four defects in the old arrangement — and a sweep that
 * models the controls by hand rather than asking this function is a sweep of something other than
 * the scene.
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
  const polar = Math.min(Math.max(request.polar, 0), Math.PI)

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
 * How much room a camera position has, in scene units, against each thing that must still hold.
 *
 * Reported as numbers rather than a boolean so a sweep can say how close the worst case came, which
 * is the difference between "no failures" and "no failures, and the nearest miss was 90.3 units".
 */
export function clearances(camera: [number, number, number], far: number) {
  // Where the sky pass actually puts its camera: the same offset, in the planet's own units.
  const sky = camera.map((component) => component * PARALLAX_SCALE)
  const fromCentre = Math.hypot(sky[0], sky[1] + EARTH_CENTRE, sky[2])

  return {
    fromCentre,
    /** Above the top of the air — the failure the old floor existed to prevent. */
    air: fromCentre - ATMOSPHERE_RADIUS,
    /** Between the far corner of the station and the near pass's far clipping plane. */
    farPlane: far - (Math.hypot(...camera) + STATION_RADIUS),
  }
}
