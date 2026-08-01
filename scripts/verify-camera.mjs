/**
 * Sweeps every camera position the orbit controls can reach, and checks none of them is somewhere
 * the scene cannot be drawn from.
 *
 * This exists because of the order the three defects were found in, which is the whole argument for
 * having it. The first — the camera swinging under the station into the atmosphere shell, turning
 * the left of the frame flat blue — arrived as a screenshot from a user. Fixing it looked complete:
 * a distance-aware angle limit, seven unit tests, a verified screenshot. Then sweeping the *rest*
 * of the extremes found two more, one of them worse than the original: panning does not orbit the
 * camera, it carries it, so it walked straight past the new limit and put the camera 179 units
 * under the ground while the limit reported 0° and success.
 *
 * The lesson is not about cameras. Each rule was correct on its own and tested on its own; what
 * failed was their composition, and only a sweep over the whole reachable space could see it. So
 * the sweep is a script rather than a thing done once by hand.
 *
 * Unlike its neighbours this one needs no network and no telemetry — it is pure geometry, and a
 * coarse version of it runs in the test suite as well, so CI catches a regression without waiting
 * for someone to remember.
 *
 * Usage: npm run verify:camera
 */
import {
  ATMOSPHERE_RADIUS,
  EARTH_CENTRE,
  EARTH_RADIUS,
} from '../src/scene/earthLimb.ts'
import {
  PAN_LIMIT,
  TARGET_FLOOR,
  clearances,
  farPlane,
  reachableCamera,
} from '../src/scene/cameraFloor.ts'

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
const PAN_HEIGHTS = [0, -3, -40, -80, -120, -400, -1000, -5000, 60, 200, 3000]
const PAN_SIDEWAYS = [0, 40, 150, 600, 5000]
const POLAR_STEP_DEG = 5
const AZIMUTH_STEP_DEG = 30

console.log('Camera sweep — every position the controls can be dragged to\n')
console.log(`  orbit radius      ${BOUNDS.minDistance} to ${BOUNDS.maxDistance}`)
console.log(`  pan floor         ${TARGET_FLOOR.toFixed(1)}, reach ${PAN_LIMIT}`)
console.log(`  air starts        ${(EARTH_CENTRE - ATMOSPHERE_RADIUS).toFixed(1)} below the station`)
console.log(`  ground at         ${(EARTH_CENTRE - EARTH_RADIUS).toFixed(1)} below the station`)
console.log(`  far plane         ${FAR}\n`)

const failures = []
const worst = { air: Infinity, ground: Infinity, farPlane: Infinity }
let samples = 0

for (const height of PAN_HEIGHTS) {
  for (const sideways of PAN_SIDEWAYS) {
    for (const distance of DISTANCES) {
      for (let polarDeg = 0; polarDeg <= 180; polarDeg += POLAR_STEP_DEG) {
        for (let azimuthDeg = 0; azimuthDeg < 360; azimuthDeg += AZIMUTH_STEP_DEG) {
          const { camera } = reachableCamera(
            {
              distance,
              polar: (polarDeg * Math.PI) / 180,
              azimuth: (azimuthDeg * Math.PI) / 180,
              target: [sideways, height, 0],
            },
            BOUNDS,
          )
          const room = clearances(camera, FAR)
          samples += 1

          for (const key of ['air', 'ground', 'farPlane']) {
            if (room[key] < worst[key]) worst[key] = room[key]
          }

          const broken = ['air', 'ground', 'farPlane'].filter((key) => room[key] < 0)
          if (broken.length) {
            failures.push({ height, sideways, distance, polarDeg, azimuthDeg, broken, room })
          }
        }
      }
    }
  }
}

console.log(`  ${samples.toLocaleString('en-GB')} positions tested\n`)
console.log('  nearest miss')
console.log(`    above the air        ${worst.air.toFixed(1)}`)
console.log(`    above the ground     ${worst.ground.toFixed(1)}`)
console.log(`    inside the far plane ${worst.farPlane.toFixed(1)}`)

if (failures.length === 0) {
  console.log('\nEvery reachable position can be drawn from.')
  process.exit(0)
}

// Group by what broke, so a hundred symptoms of one cause read as one cause.
const byKind = new Map()
for (const failure of failures) {
  const kind = failure.broken.join(' + ')
  if (!byKind.has(kind)) byKind.set(kind, [])
  byKind.get(kind).push(failure)
}

console.log(`\n${failures.length} of ${samples} positions cannot be drawn from:\n`)
for (const [kind, group] of byKind) {
  console.log(`  ${kind} — ${group.length} positions`)
  for (const f of group.slice(0, 3)) {
    console.log(
      `    pan (${f.sideways}, ${f.height})  orbit ${f.distance}  polar ${f.polarDeg}°  ` +
        `azimuth ${f.azimuthDeg}°  →  air ${f.room.air.toFixed(1)}, ground ${f.room.ground.toFixed(1)}`,
    )
  }
}
process.exit(1)
