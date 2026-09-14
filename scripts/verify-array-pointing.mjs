/**
 * Checks where the solar arrays are actually pointing, against where the Sun actually is.
 *
 * This exists because the 3D scene cannot be trusted to answer the question. Measuring it in the
 * browser needs the render loop, and the render loop stops whenever the window is not the one in
 * front — three times a set of readings turned out to have come from a frozen frame, with the Sun
 * still sitting at three.js's default `(0, 1, 0)`, and each time the numbers looked reasonable
 * enough to publish. Here the geometry is rebuilt from the glTF file and the solar vector from the
 * propagator, with nothing in the path that can silently stop.
 *
 * Two parts, in order, because they are answerable independently:
 *
 *   Geometry   Re-derives from the model the constants `nodeMapping` declares — the half turn on
 *              each beta joint and the side its cells face, the axis each alpha joint turns about,
 *              the frame the truss lands in — and checks the rest orientations are real rotations.
 *              No Sun, no clock, no stream. A change to the model, or a typo in the table, fails
 *              here.
 *
 *   Pointing   Applies the live telemetry and asks where each blanket ends up relative to the Sun.
 *              `off-Sun` is the angle from face-on, two-sided. `cells` says which face that is,
 *              which the two-sided figure cannot: a joint turning the wrong way puts the back of
 *              the wing to the Sun and reads the same off-Sun angle as one facing it. `ideal BGA`
 *              is the angle that would face the Sun, found by sweeping rather than by algebra so
 *              it assumes nothing about which way the joint turns. `best reachable` is what no
 *              beta angle can remove: large there means the residual is not in this joint.
 *
 *              What counts as passing is not "on the Sun". The station flies its wings biased —
 *              the collector's record read a constant 44° on all eight for five weeks, the "sun
 *              slicer" drag-reduction bias its status reports put at 42.5° to 47° — and parks them
 *              at 0° or 180° past about 48° of beta. A wing passes if it is tracking, biased by
 *              about that much, or parked, with its cells toward the Sun in every case.
 *
 * Exits non-zero if any check fails, so it can be run without reading it.
 *
 * Usage: npm run verify:arrays
 */
import { Matrix4, Quaternion, Vector3 } from 'three'
import { twoline2satrec } from 'satellite.js'
import { propagateIss, betaAngle, sunDirectionLvlh } from '../src/orbit/propagator.ts'
import { JOINT_BINDINGS } from '../src/scene/nasa/nodeMapping.ts'
// The model, the joints and the per-wing measurement live in one place, shared with
// `analyse:offset`. See that file's header for what happened the one time they did not.
import {
  AXES,
  BLANKET_NORMAL,
  byName,
  cellNormal,
  cellSide,
  cellSideFromIrosa,
  measureWing,
  setJoint,
  worldMatrix,
} from './lib/array-geometry.mjs'

const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'

const LIGHTSTREAMER = 'https://push.lightstreamer.com/lightstreamer'
const TLCP = 'LS_protocol=TLCP-2.5.0'
const CID = 'mgQkwtwdysogQz2BJ4Ji kOj2rm'

// --------------------------------------------------- part one: geometry alone
//
// Nothing below this heading touches the Sun, the clock or the stream. It re-derives from the
// model the constants the bindings declare, so those constants can be checked rather than
// believed. A change to the model, or a typo in the table, fails here.

let failures = 0
const fail = (message) => {
  console.log(`  FAIL  ${message}`)
  failures += 1
}

console.log('Geometry (model only, no Sun, no telemetry)\n')

// Rest orientations must be unit quaternions. They are not automatically: `Truss_S6` carries a
// uniform scale of 63.33 and the joints under it 0.016, and reading a rotation off those matrices
// with `setFromRotationMatrix` returns something that is not a rotation at all. That mistake is
// what once made the S6 wings look 71° out, so it is checked rather than remembered.
const notUnit = JOINT_BINDINGS.filter(
  (binding) => Math.abs(byName.get(binding.node).rest.length() - 1) > 1e-6,
)
if (notUnit.length) fail(`rest orientation is not a unit quaternion: ${notUnit.map((b) => b.node).join(', ')}`)
else console.log(`  ok    all ${JOINT_BINDINGS.length} rest orientations are unit quaternions`)

// The alpha joints turn about the truss. Everything else here is measured against that axis, so
// if this is wrong the rest of the section means nothing.
for (const binding of JOINT_BINDINGS) setJoint(binding, 0)
const trussAxis = new Vector3(0, 0, 1)
  .transformDirection(worldMatrix(byName.get('PORT_ALPHA_ROT')))
  .normalize()

for (const name of ['PORT_ALPHA_ROT', 'STBD_ALPHA_ROT']) {
  const axis = new Vector3(0, 0, 1).transformDirection(worldMatrix(byName.get(name))).normalize()
  const off = (Math.acos(Math.min(1, Math.abs(axis.dot(trussAxis)))) * 180) / Math.PI
  if (off > 0.5) fail(`${name} turns about an axis ${off.toFixed(1)}° off the truss`)
}
// In the scene frame the truss lies along X — starboard. A different answer means the model
// rotation in IssGltf no longer matches this script, and every angle below would be measured in
// the wrong frame while still looking plausible.
if (Math.abs(Math.abs(trussAxis.x) - 1) > 0.01) {
  fail(`the truss axis is [${trussAxis.x.toFixed(2)}, ${trussAxis.y.toFixed(2)}, ${trussAxis.z.toFixed(2)}], not the scene's X`)
} else {
  console.log('  ok    both alpha joints turn about the truss, and the truss lies along scene X')
}

// The declared `zero` of each beta joint, re-derived in two steps. The station's BGA reads zero
// with the blanket lying in the plane perpendicular to the truss — its normal *along* the truss —
// which the geometry alone finds modulo a half turn. The half turn is the side the cells face: at
// zero they face inboard, and which side of the blanket carries them the model states only
// indirectly, by where it deploys the iROSA. So the side is read two ways and must agree.
console.log('\n  wing        declared   re-derived   residual   cells at 0°   cell side (box / iROSA)')
const wingsDeclared = JOINT_BINDINGS.filter((b) => b.node.includes('BETA_ROT'))
for (const binding of wingsDeclared) {
  const tiltAt = (angle) => {
    // Bypass `sign` and `zero` here: this asks what the model does, not what the bindings claim.
    const node = byName.get(binding.node)
    const position = new Vector3()
    const scale = new Vector3()
    node.local.decompose(position, new Quaternion(), scale)
    node.applied = new Matrix4().compose(
      position,
      node.rest.clone().multiply(
        new Quaternion().setFromAxisAngle(AXES[binding.axis], (angle * Math.PI) / 180),
      ),
      scale,
    )
    const normal = BLANKET_NORMAL.clone()
      .transformDirection(worldMatrix(node))
      .normalize()
    // Degrees between the blanket's normal and the truss: zero when the normal lies along it.
    return (Math.acos(Math.min(1, Math.abs(normal.dot(trussAxis)))) * 180) / Math.PI
  }

  let best = { angle: 0, tilt: Infinity }
  for (let angle = 0; angle < 360; angle += 0.05) {
    const tilt = tiltAt(angle)
    if (tilt < best.tilt) best = { angle, tilt }
  }

  const declared = binding.zero ?? 0
  // A half turn about the mast puts the normal back along the truss, so the two agree modulo 180.
  const gap = Math.abs((((best.angle - declared) % 180) + 270) % 180 - 90)

  // The half turn itself: with the bindings applied and the joint at its published zero, the
  // cells must face inboard — towards the station's centre, along the truss.
  setJoint(binding, 0)
  const inboard = binding.node.startsWith('STBD') ? -1 : 1
  const facing = cellNormal(binding).x * inboard
  const side = cellSide(binding)
  const irosa = cellSideFromIrosa(binding)
  const sideAgrees = irosa === null || irosa === side

  const name = binding.node.replace('_BETA_ROT', '').replace('PORT_', 'P ').replace('STBD_', 'S ')
  console.log(
    `  ${name.padEnd(10)} ${String(declared).padStart(8)}°   ${best.angle.toFixed(2).padStart(8)}°   ` +
      `${best.tilt.toFixed(3).padStart(7)}°   ${(facing > 0.99 ? 'inboard' : facing < -0.99 ? 'OUTBOARD' : 'ACROSS').padEnd(11)}` +
      `   ${side > 0 ? '+X' : '-X'} / ${irosa === null ? 'none' : irosa > 0 ? '+X' : '-X'}` +
      `  ${gap < 0.5 && facing > 0.99 && sideAgrees ? 'ok' : 'MISMATCH'}`,
  )
  if (gap >= 0.5 || facing <= 0.99 || !sideAgrees) failures += 1
}

// ------------------------------------------------------------- the telemetry

const PUIS = JOINT_BINDINGS.map((binding) => binding.pui)

async function readTelemetry(seconds = 12) {
  const post = (url, fields) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    })

  const response = await post(`${LIGHTSTREAMER}/create_session.txt?${TLCP}`, {
    LS_adapter_set: 'ISSLIVE',
    LS_cid: CID,
    LS_send_sync: 'false',
  })
  if (!response.ok || !response.body) throw new Error(`stream session failed: ${response.status}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const deadline = Date.now() + seconds * 1000
  const values = new Map()
  let buffer = ''
  let session = null

  while (Date.now() < deadline) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\r\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line || line === 'PROBE' || line.startsWith('NOOP')) continue
      if (line.startsWith('CONOK,') && !session) {
        session = line.split(',')[1]
        await post(`${LIGHTSTREAMER}/control.txt?${TLCP}&LS_session=${session}`, {
          LS_reqId: '1',
          LS_op: 'add',
          LS_subId: '1',
          LS_mode: 'MERGE',
          LS_group: PUIS.join(' '),
          LS_schema: 'TimeStamp Value',
          LS_snapshot: 'true',
        })
        continue
      }
      if (line.startsWith('U,')) {
        const [, , index, ...rest] = line.split(',')
        const raw = rest.join(',').split('|')[1]
        const pui = PUIS[Number(index) - 1]
        if (pui && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))) {
          values.set(pui, Number(raw))
        }
      }
    }
  }
  await reader.cancel().catch(() => {})
  return values
}

/**
 * How far off the Sun a wing may read before this is a defect.
 *
 * The station's own tracking is not perfect and neither is a TLE a few hours old, so this is not
 * asking for zero. It is asking that no wing be somewhere else entirely, which is the failure the
 * last three rounds of this work kept producing.
 */
const TOLERANCE = 15

// ------------------------------------- part two: against the Sun, live
//
// The geometry above fixes the constants without ever asking where the Sun is. This part asks,
// which is what makes it a check rather than a restatement.

console.log('\nPointing (live telemetry against the propagated solar vector)\n')

const tle = await (await fetch(CELESTRAK)).text()
const [, line1, line2] = tle.trim().split('\n').map((line) => line.trim())
const satrec = twoline2satrec(line1, line2)

const at = new Date()
const orbit = propagateIss(satrec, at)
const beta = betaAngle(orbit, at)
const sun = new Vector3(...sunDirectionLvlh(orbit, at)).normalize()

// --------------------------------------------------------------- the report

const telemetry = await readTelemetry()
const missing = PUIS.filter((pui) => !telemetry.has(pui))
if (missing.length) console.log(`no data for: ${missing.join(', ')}\n`)

for (const binding of JOINT_BINDINGS) {
  const angle = telemetry.get(binding.pui)
  if (angle !== undefined) setJoint(binding, angle)
}

const wings = JOINT_BINDINGS.filter((binding) => binding.node.includes('BETA_ROT'))

console.log(`instant : ${at.toISOString()}`)
console.log(`beta    : ${beta.toFixed(2)}°   shadow ${orbit.shadow.toFixed(2)}`)
console.log(`SARJ    : port ${telemetry.get('S0000004')?.toFixed(2)}°  starboard ${telemetry.get('S0000003')?.toFixed(2)}°`)
console.log(`          (they sum to ${((telemetry.get('S0000004') ?? 0) + (telemetry.get('S0000003') ?? 0)).toFixed(2)}°, so the two publish mirrored conventions)\n`)

console.log('wing        published   off-Sun   cells    ideal BGA   offset   best reachable')
// The sweep, the two-sided fold and the irreducible residual are `measureWing`'s, shared with
// `analyse:offset`. They were written twice for a while and this is the file that would have gone
// stale: the other one runs unattended over the stored record and nobody reads its arithmetic.
const measured = []
for (const binding of wings) {
  const published = telemetry.get(binding.pui)
  if (published === undefined) continue
  const wing = measureWing(binding, published, sun)
  // The one thing the two-sided fold discards, and the thing a reversed joint gets wrong.
  wing.cellsToSun = cellNormal(binding).dot(sun) > 0
  measured.push(wing)

  const name = binding.node.replace('_BETA_ROT', '').replace('PORT_', 'P ').replace('STBD_', 'S ')
  console.log(
    `${name.padEnd(10)} ${published.toFixed(1).padStart(8)}° ${wing.off.toFixed(1).padStart(8)}° ` +
      `  ${(wing.cellsToSun ? 'to Sun' : 'AWAY').padEnd(7)}${wing.ideal.toFixed(1).padStart(9)}° ` +
      `${wing.offset.toFixed(1).padStart(7)}° ${wing.irreducible.toFixed(1).padStart(13)}°`,
  )
}

/**
 * Are the arrays actually tracking the Sun tonight?
 *
 * This check has a premise, and until it was violated nobody had written the premise down: that
 * the station is flying nominal LVLH and its arrays are following the Sun. When they are not — a
 * visiting vehicle on approach, an EVA, a manoeuvre — the beta joints are exactly where the crew
 * left them, and blaming the model's mapping for that is a tool crying wolf.
 *
 * `best reachable` is what says so, and it was already in the table above. It is the residual no
 * beta angle can remove, so it belongs entirely to the alpha joints: large on every wing means the
 * SARJ is not where Sun-tracking would put it. That alone is ambiguous — a broken alpha mapping
 * looks the same — so when it fires, the telemetry is read a second time a minute and a quarter
 * later. Joints that have not moved while the geometry has are parked; joints that moved are a
 * regression, and still fail.
 */
// Already computed above, once, rather than swept a second time at half the resolution.
const irreducible = measured.map((wing) => wing.irreducible).filter((v) => Number.isFinite(v))

let parked = false
if (irreducible.length && Math.min(...irreducible) > TOLERANCE) {
  console.log(
    `
Every wing has ${Math.min(...irreducible).toFixed(1)}° or more that no beta angle can remove,` +
      ' so the alpha joints are not tracking. Reading again in 25 s to see whether they are moving.',
  )
  // Twenty-five seconds, not the seventy-five it started at. A tracking SARJ turns 4°/min, so it
  // covers 1.7° in that time against a 0.5° threshold — three times the margin needed, for a third
  // of the wait. It was the single slowest thing in the whole verification suite at 107 s.
  await new Promise((resolve) => setTimeout(resolve, 25_000))
  const again = await readTelemetry()
  const moved = JOINT_BINDINGS.map((binding) => {
    const before = telemetry.get(binding.pui)
    const after = again.get(binding.pui)
    return before === undefined || after === undefined ? 0 : Math.abs(after - before)
  })
  const largest = Math.max(...moved)
  parked = largest < 0.5
  console.log(
    `  largest joint movement in 75 s: ${largest.toFixed(2)}°` +
      ` — a tracking SARJ turns about 4°/min, so this is ${parked ? 'parked' : 'moving'}.`,
  )
}

/**
 * What a wing is allowed to be doing.
 *
 * For a year this check asked every wing to be within `TOLERANCE` of the Sun and, when all eight
 * were not, kept a log of off-Sun against beta to decide whether the station was off-pointing on
 * purpose or the joint zeros were out. The collector answered that with five weeks of record
 * instead of a handful of runs (`analyse:offset`), and the answer was neither: the joints were
 * turning the wrong way, and behind that the station had been flying a constant bias all along.
 *
 * So three states pass, and the two that are not "tracking" are the station's own, documented:
 *
 *   tracking   within `TOLERANCE` of the Sun. Not seen yet in the record, but it is what the
 *              station's Autotrack mode does with no bias commanded.
 *   parked     directed to 0° or 180°, which the record shows six wings doing past about 48° of
 *              beta. Cells inboard along the truss, so 90° − |beta| off the Sun — better than the
 *              bias by then, which is presumably why.
 *   biased     Autotrack with a bias. The large one is the "sun slicer" — "drag reduction-biased
 *              by 47 deg", as the on-orbit status reports put it, 42.5° at higher beta — and the
 *              record read 43° to 45° on all eight wings from 11 August to 1 September 2026. But
 *              the record also shows single wings held at 20° to 22° for days at high beta, so a
 *              bias is any angle short of the Sun up to `LARGEST_BIAS` plus the tolerance a
 *              tracking wing gets for lag and a TLE a few hours old. This check does not know the
 *              commanded bias — the public stream carries none — so it cannot ask for a value.
 *
 * In every state the cells face the Sun. A wing whose back is to the Sun is not in any of them
 * and fails outright: that is exactly what a reversed joint produces, and exactly what a two-sided
 * off-Sun angle cannot see. So does a wing further off than any bias the station flies, which is
 * what a zero out by a quarter turn or more looks like.
 */
const LARGEST_BIAS = 47
const PARKED_WITHIN = 2

const stateOf = (wing) => {
  const published = wing.published
  const atStop = Math.min(published % 180, 180 - (published % 180)) <= PARKED_WITHIN
  if (wing.off <= TOLERANCE) return 'tracking'
  if (atStop) return 'parked'
  if (wing.off <= LARGEST_BIAS + TOLERANCE) return 'biased'
  return null
}

const states = new Map()
for (const wing of measured) {
  const name = wing.node.replace('_BETA_ROT', '')
  if (parked) {
    // The alpha guard already showed the truss is not tracking; the wings are wherever the crew
    // left them, and nothing below can be read from that.
    if (wing.off > TOLERANCE) console.log(`  note  ${name} is ${wing.off.toFixed(1)}° off the Sun — the arrays are parked, not mispointed`)
    continue
  }
  if (!wing.cellsToSun) {
    fail(`${name} has its back to the Sun — the cells face away, which no mode of the station does`)
    continue
  }
  const state = stateOf(wing)
  if (state === null) {
    fail(`${name} is ${wing.off.toFixed(1)}° off the Sun: not tracking, not parked, further than any bias the station flies`)
    continue
  }
  states.set(state, [...(states.get(state) ?? []), name])
}

for (const [state, names] of states) {
  console.log(`  ${state.padEnd(9)} ${names.length} wing${names.length === 1 ? '' : 's'}: ${names.map((n) => n.replace(/^(PORT|STBD)_/, '')).join(' ')}`)
}

// Both wings of a module publish mirrored angles, and so must end up pointing the same way. This
// catches a swapped pair, which the state test alone would miss when both land in a passing state.
const spreadAcrossWings =
  Math.max(...measured.map((w) => w.off)) - Math.min(...measured.map((w) => w.off))
if (!parked && states.size === 1 && spreadAcrossWings > 10) {
  fail(`the eight wings disagree by ${spreadAcrossWings.toFixed(1)}° about where the Sun is`)
}

console.log(
  `\n|beta| is ${Math.abs(beta).toFixed(1)}°. A wing facing the Sun reads 90° ∓ beta (or 270° ± beta on the wing that` +
    `\ncounts the other way); the sun-slicer bias sits about 45° short of that, and a parked wing at 0° or 180°.`,
)

console.log(
  failures === 0
    ? '\nAll checks pass.'
    : `\n${failures} check${failures === 1 ? '' : 's'} failed.`,
)
process.exit(failures === 0 ? 0 : 1)
