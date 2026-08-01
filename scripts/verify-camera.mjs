/**
 * Sweeps every camera position the orbit controls can reach, and asks two things of each: whether
 * the sky can be drawn from it, and whether the sky it draws is the sky that is there.
 *
 * This exists because of the order the defects were found in, which is the whole argument for
 * keeping it. The first — the camera swinging under the station into the atmosphere shell, turning
 * the left of the frame flat blue — arrived as a screenshot from a user. Fixing it looked complete:
 * a distance-aware angle limit, seven unit tests, a verified screenshot. Then sweeping the *rest*
 * of the extremes found two more, one worse than the original: panning does not orbit the camera,
 * it carries it, so it walked straight past the new limit and put the camera 179 units under the
 * ground while the limit reported 0° and success.
 *
 * All of them had one cause, which those limits treated rather than removed: the planet was pinned
 * to the station's origin, so 400 units of orbit — four hundred metres — were 400 units against a
 * surface 118.7 below. The sky now has a pass of its own, whose camera turns those 400 units into
 * 0.113 of the planet's, and the limits are gone with the cause. So the sweep changed with them. It
 * no longer asks whether a limit held; it asks whether the geometry can fail at all, and it carries
 * the old arrangement alongside as a control, so a regression to a single pass shows up as a
 * failure rather than as silence.
 *
 * Section 3 is the point of the exercise. For every position it compares the horizon the scene
 * draws against the horizon a real observer at that offset would see, computed in kilometres from
 * the real Earth — an independent quantity rather than a restatement of the scene's arithmetic.
 *
 * Unlike its neighbours this one needs no network and no telemetry, and a coarse version runs in
 * the test suite as well, so CI catches a regression without waiting for someone to remember.
 *
 * Usage: npm run verify:camera
 */
import { ATMOSPHERE_RADIUS, EARTH_CENTRE, EARTH_RADIUS } from '../src/scene/earthLimb.ts'
import { PARALLAX_SCALE, horizonAngle } from '../src/scene/distantScene.ts'
import {
  STATION_RADIUS,
  clearances,
  farPlane,
  reachableCamera,
} from '../src/scene/cameraReach.ts'

/** The orbit controls' configuration in StationView. Change one and this must be changed with it. */
const BOUNDS = { minDistance: 15, maxDistance: 400 }
const FAR = farPlane(BOUNDS.maxDistance)

/**
 * Requests to make of the controls, including plenty they will refuse.
 *
 * Sweeping only the legal range would test the wrong thing: the question is what happens when a
 * user drags past the end, which is the only way any of this was ever reached.
 */
const DISTANCES = [1, 15, 25, 40, 60, 105, 150, 200, 250, 325, 400, 800]
const PAN_HEIGHTS = [0, -3, -40, -120, -400, -5000, 60, 200, 3000]
const PAN_SIDEWAYS = [0, 40, 150, 600, 5000]
const STEP_DEGREES = 5

const failures = []
let positions = 0
let worstAir = { room: Infinity }
let worstFar = { room: Infinity }
let worstHorizon = { error: -1 }
let worstPinned = Infinity

for (const height of PAN_HEIGHTS) {
  for (const sideways of PAN_SIDEWAYS) {
    const target = [sideways, height, sideways * 0.6]
    for (const distance of DISTANCES) {
      for (let polar = 0; polar <= 180; polar += STEP_DEGREES) {
        for (let azimuth = 0; azimuth < 360; azimuth += STEP_DEGREES) {
          const { camera } = reachableCamera(
            {
              distance,
              polar: (polar * Math.PI) / 180,
              azimuth: (azimuth * Math.PI) / 180,
              target,
            },
            BOUNDS,
          )
          positions += 1

          const where = { height, sideways, distance, polar, azimuth }
          const room = clearances(camera, FAR)

          if (room.air < worstAir.room) worstAir = { room: room.air, ...where }
          if (room.farPlane < worstFar.room) worstFar = { room: room.farPlane, ...where }
          if (room.air <= 0) failures.push({ what: 'inside the air', room: room.air, ...where })
          if (room.farPlane <= 0) {
            failures.push({ what: 'station clipped away', room: room.farPlane, ...where })
          }

          // What the sky pass draws, against what an observer standing there would see.
          const angle = horizonAngle(camera)
          const error = Math.abs(angle.pass - angle.real)
          if (error > worstHorizon.error) worstHorizon = { error, ...where, ...angle }
          if (error > 0.01) failures.push({ what: 'horizon off the sky', room: error, ...where })

          // The control: the same position with the planet pinned to the origin, as it used to be.
          worstPinned = Math.min(
            worstPinned,
            Math.hypot(camera[0], camera[1] + EARTH_CENTRE, camera[2]) - ATMOSPHERE_RADIUS,
          )
        }
      }
    }
  }
}

const deg = (value) => `${value.toFixed(4)}°`
const at = (p) =>
  `target ${p.sideways}/${p.height}, ${p.distance} out, polar ${p.polar}°, azimuth ${p.azimuth}°`

console.log(`Sweeping ${positions.toLocaleString('en-GB')} camera positions.\n`)

console.log('1. The sky pass can be drawn from every one of them')
console.log(
  `  [info] the planet's surface is ${(EARTH_CENTRE - EARTH_RADIUS).toFixed(1)} units below the` +
    ` station, the top of its air ${(EARTH_CENTRE - ATMOSPHERE_RADIUS).toFixed(1)}`,
)
console.log(
  `  [info] the camera's whole reach is worth ${(BOUNDS.maxDistance * PARALLAX_SCALE).toFixed(3)}` +
    ' units to that pass',
)
console.log(
  `  [${worstAir.room > 0 ? 'ok  ' : 'FAIL'}] nearest approach to the air` +
    ` ${worstAir.room.toFixed(2)} units — ${at(worstAir)}`,
)

console.log('\n2. The station stays inside the near pass')
console.log(
  `  [info] far plane ${FAR}, station radius ${STATION_RADIUS} — a single pass needed 4400`,
)
console.log(
  `  [${worstFar.room > 0 ? 'ok  ' : 'FAIL'}] tightest margin` +
    ` ${worstFar.room.toFixed(2)} units — ${at(worstFar)}`,
)

console.log('\n3. The horizon is the one the sky has')
console.log(`  [info] from the station itself ${deg(horizonAngle([0, 0, 0]).real)}`)
console.log(
  `  [${worstHorizon.error < 0.01 ? 'ok  ' : 'FAIL'}] worst disagreement` +
    ` ${deg(worstHorizon.error)} — ${at(worstHorizon)}`,
)
console.log(
  `         scene ${deg(worstHorizon.pass)} against ${deg(worstHorizon.real)} for an observer there`,
)

console.log('\n4. Control: the same sweep with the planet pinned to the origin')
const collapsed = horizonAngle([0, BOUNDS.maxDistance, 0])
console.log(`  [info] deepest the camera got inside the air ${worstPinned.toFixed(1)} units`)
console.log(
  `  [info] horizon at full reach ${deg(collapsed.scene)} against ${deg(collapsed.real)}` +
    ' — the defect this replaced',
)
console.log(
  `  [${worstPinned < 0 ? 'ok  ' : 'FAIL'}] the old arrangement fails this sweep, so the sweep` +
    ' can still tell',
)

if (failures.length > 0 || worstPinned >= 0) {
  console.log(`\n${failures.length} position(s) could not be drawn from:`)
  for (const failure of failures.slice(0, 12)) {
    console.log(`  ${failure.what}: ${failure.room.toFixed(2)} — ${at(failure)}`)
  }
  process.exitCode = 1
} else {
  console.log('\nEvery reachable position shows the sky the sky is showing.')
}
