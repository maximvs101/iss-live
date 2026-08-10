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
 *   Geometry   Re-derives from the model the constants `nodeMapping` declares — the quarter turn
 *              on each beta joint, the axis each alpha joint turns about, the frame the truss
 *              lands in — and checks the rest orientations are real rotations. No Sun, no clock,
 *              no stream. A change to the model, or a typo in the table, fails here.
 *
 *   Pointing   Applies the live telemetry and asks where each blanket ends up relative to the Sun.
 *              `off-Sun` is the angle from face-on. `ideal BGA` is the angle that would face the
 *              Sun, found by sweeping rather than by algebra so it assumes nothing about which way
 *              the joint turns. `best reachable` is what no beta angle can remove: large there
 *              means the residual is not in this joint.
 *
 * Exits non-zero if any check fails, so it can be run without reading it.
 *
 * Usage: npm run verify:arrays
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { twoline2satrec } from 'satellite.js'
import { propagateIss, betaAngle, sunDirectionLvlh } from '../src/orbit/propagator.ts'
import { JOINT_BINDINGS, jointAngle } from '../src/scene/nasa/nodeMapping.ts'

// Resolved against this file, not the working directory: run from the wrong folder and a relative
// path fails with a missing-module error that says nothing about the real mistake.
const MODEL = new URL('../public/models/iss-igoal.glb', import.meta.url)
const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'

const LIGHTSTREAMER = 'https://push.lightstreamer.com/lightstreamer'
const TLCP = 'LS_protocol=TLCP-2.5.0'
const CID = 'mgQkwtwdysogQz2BJ4Ji kOj2rm'

/** Rotation the component applies to bring the model into the scene frame. */
// +X starboard, +Y zenith, +Z aft — matches the `rotation` prop in IssGltf.
const MODEL_ROTATION = new Quaternion().setFromEuler(new Euler(0, -Math.PI / 2, 0))

/**
 * The blanket's normal, in the beta joint's own frame.
 *
 * Local X, confirmed two ways: principal components over the vertex cloud, and the wing's extent
 * in its own frame, which comes out 244 × 449 × 1392 — thinnest on X by a factor of nearly two.
 */
const BLANKET_NORMAL = new Vector3(1, 0, 0)

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) }

// ---------------------------------------------------------------- the model

const buffer = readFileSync(MODEL)
const jsonLength = buffer.readUInt32LE(12)
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'))

/** node index -> { name, local, children, parent } */
const nodes = gltf.nodes.map((node, index) => {
  const local = new Matrix4()
  if (node.matrix) local.fromArray(node.matrix)
  else
    local.compose(
      new Vector3(...(node.translation ?? [0, 0, 0])),
      new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
      new Vector3(...(node.scale ?? [1, 1, 1])),
    )
  return { index, name: node.name ?? '', local, children: node.children ?? [], parent: -1 }
})
for (const node of nodes) for (const child of node.children) nodes[child].parent = node.index

const byName = new Map(nodes.map((node) => [node.name, node]))

/**
 * Resting orientation of each joint, taken from the file before anything is applied.
 *
 * Via `decompose`, not `setFromRotationMatrix`. The latter assumes the upper 3×3 is orthonormal and
 * says nothing when it is not: `Truss_S6` carries a uniform scale of 63.33 and the joints beneath it
 * 0.016, which is how the model keeps that module in its own units. Reading a quaternion straight
 * off those matrices returns a non-unit one, and every rotation composed with it comes out wrong —
 * which is exactly, and only, what made the S6 wings look 71° out. The scene never had that
 * problem: three.js's loader decomposes the transforms itself.
 */
for (const node of nodes) {
  node.rest = new Quaternion()
  node.local.decompose(new Vector3(), node.rest, new Vector3())
}

/** Rebuilds a node's world matrix, honouring whatever rotations have been set on the chain. */
function worldMatrix(node) {
  const chain = []
  for (let n = node; n; n = n.parent >= 0 ? nodes[n.parent] : null) chain.unshift(n)
  const out = new Matrix4().makeRotationFromQuaternion(MODEL_ROTATION)
  for (const n of chain) out.multiply(n.applied ?? n.local)
  return out
}

/** Sets a joint to `angle` degrees the way the component does: rest, zero offset, then the angle. */
function setJoint(binding, angle) {
  const node = byName.get(binding.node)
  const position = new Vector3()
  const scale = new Vector3()
  const rotation = new Quaternion()
  node.local.decompose(position, rotation, scale)
  const turned = node.rest
    .clone()
    .multiply(
      new Quaternion().setFromAxisAngle(
        AXES[binding.axis],
        // The same function the scene uses, imported rather than copied.
        (jointAngle(binding, angle) * Math.PI) / 180,
      ),
    )
  node.applied = new Matrix4().compose(position, turned, scale)
}

/** Unit normal of a wing's blanket, in the scene frame. */
function blanketNormal(binding) {
  const world = worldMatrix(byName.get(binding.node))
  const normal = BLANKET_NORMAL.clone().transformDirection(world)
  return normal.normalize()
}

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

// The declared `zero` of each beta joint, re-derived: the rotation that lays the blanket in the
// plane perpendicular to the truss, which is where the station measures its BGA angle from.
console.log('\n  wing        declared   re-derived   residual')
for (const binding of JOINT_BINDINGS.filter((b) => b.node.includes('BETA_ROT'))) {
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
    return (Math.asin(Math.min(1, Math.abs(normal.dot(trussAxis)))) * 180) / Math.PI
  }

  let best = { angle: 0, tilt: Infinity }
  for (let angle = 0; angle < 360; angle += 0.05) {
    const tilt = tiltAt(angle)
    if (tilt < best.tilt) best = { angle, tilt }
  }
  setJoint(binding, 0)

  const declared = binding.zero ?? 0
  // A half turn about the mast puts the blanket back in the same plane, so the two agree modulo 180.
  const gap = Math.abs((((best.angle - declared) % 180) + 270) % 180 - 90)
  const name = binding.node.replace('_BETA_ROT', '').replace('PORT_', 'P ').replace('STBD_', 'S ')
  console.log(
    `  ${name.padEnd(10)} ${String(declared).padStart(8)}°   ${best.angle.toFixed(2).padStart(8)}°   ` +
      `${best.tilt.toFixed(3).padStart(7)}°  ${gap < 0.5 ? 'ok' : 'MISMATCH'}`,
  )
  if (gap >= 0.5) failures += 1
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

/** Angle between a normal and the Sun, taking the blanket as two-sided. */
const offSun = (normal) => (Math.acos(Math.min(1, Math.abs(normal.dot(sun)))) * 180) / Math.PI

const wings = JOINT_BINDINGS.filter((binding) => binding.node.includes('BETA_ROT'))

console.log(`instant : ${at.toISOString()}`)
console.log(`beta    : ${beta.toFixed(2)}°   shadow ${orbit.shadow.toFixed(2)}`)
console.log(`SARJ    : port ${telemetry.get('S0000004')?.toFixed(2)}°  starboard ${telemetry.get('S0000003')?.toFixed(2)}°`)
console.log(`          (they sum to ${((telemetry.get('S0000004') ?? 0) + (telemetry.get('S0000003') ?? 0)).toFixed(2)}°, so the two publish mirrored conventions)\n`)

console.log('wing        published   off-Sun   ideal BGA   offset   best reachable')
const offsets = []
for (const binding of wings) {
  const published = telemetry.get(binding.pui)
  if (published === undefined) continue
  const before = offSun(blanketNormal(binding))

  // Sweep the joint over a full turn and keep the angle that faces the Sun best. `best.off` is
  // the part no beta gimbal angle can remove: if it is large, the residual is not in this joint.
  let best = { angle: null, off: Infinity }
  for (let angle = 0; angle < 360; angle += 0.25) {
    setJoint(binding, angle)
    const off = offSun(blanketNormal(binding))
    if (off < best.off) best = { angle, off }
  }
  setJoint(binding, published)

  // The joint is two-sided, so an offset of +d and one of d-180 are the same pose. Report the
  // smaller, otherwise half the wings read 180° apart for no physical reason.
  let offset = best.angle - published
  offset = ((offset % 180) + 270) % 180 - 90
  offsets.push({ node: binding.node, offset })

  const name = binding.node.replace('_BETA_ROT', '').replace('PORT_', 'P ').replace('STBD_', 'S ')
  console.log(
    `${name.padEnd(10)} ${published.toFixed(1).padStart(8)}° ${before.toFixed(1).padStart(8)}° ` +
      `${best.angle.toFixed(1).padStart(10)}° ${offset.toFixed(1).padStart(7)}° ` +
      `${best.off.toFixed(1).padStart(13)}°`,
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
const irreducible = wings
  .map((binding) => {
    const published = telemetry.get(binding.pui)
    if (published === undefined) return 0
    let best = Infinity
    for (let angle = 0; angle < 360; angle += 0.5) {
      setJoint(binding, angle)
      best = Math.min(best, offSun(blanketNormal(binding)))
    }
    setJoint(binding, published)
    return best
  })
  .filter((value) => Number.isFinite(value))

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

const mean = offsets.reduce((sum, { offset }) => sum + offset, 0) / offsets.length
const spread =
  Math.max(...offsets.map((o) => o.offset)) - Math.min(...offsets.map((o) => o.offset))
console.log(`\nrequired offset: mean ${mean.toFixed(1)}°, spread across the eight wings ${spread.toFixed(1)}°`)
console.log(`|beta| is ${Math.abs(beta).toFixed(1)}° — ideal Sun-pointing needs |BGA| to equal it.`)

/**
 * Are the wings splayed on purpose?
 *
 * The second premise this check turned out to have. The first was that the arrays are tracking at
 * all, which the parked guard above now states; this one is that when they track, they track the
 * Sun. They do not always. The two blankets on a mast shadow each other at some geometries, so the
 * station tilts them apart deliberately — beta-backtracking, and the other power and thermal modes
 * that off-point on purpose. Every wing then reads well off the Sun while nothing whatever is wrong.
 *
 * Observed 09/08/2026 at |beta| 34.5°: all eight wings 17-21° off, and the run went red.
 *
 * Three things have to hold together before that is called deliberate, and each one excludes a
 * failure this script exists to catch:
 *
 *   the two wings of every module are offset in *opposite* directions
 *       A mapping error with a flipped sign puts every wing out the same way. A splay is
 *       symmetric by construction, because it exists to open a pair apart.
 *   the mean offset is near zero while the individual offsets are large
 *       The same statement from the other side, and the one that fails loudly if a whole side of
 *       the truss is mismapped: the mean would then sit near the offset, not near zero.
 *   no wing has a large irreducible residual
 *       `best reachable` is what no beta angle can remove. Small means the alpha joints *are*
 *       where Sun-tracking puts them and each wing could face the Sun from where it is — it is
 *       commanded elsewhere. Large means the SARJ is not tracking, which is the parked case above
 *       and is not this one.
 *
 * A wing that is genuinely mispointed on its own still fails: it breaks the pairing, and it moves
 * the mean.
 */
const SPLAY_MEAN_LIMIT = 5
const SPLAY_MIN_MAGNITUDE = 10

/** `PORT_BETA_ROT_2A` and `PORT_BETA_ROT_2B` are the two blankets of one mast. */
const mastOf = (node) => node.replace(/[AB]$/, '')
const masts = new Map()
for (const { node, offset } of offsets) {
  const mast = mastOf(node)
  masts.set(mast, [...(masts.get(mast) ?? []), offset])
}

const everyMastOpensApart =
  masts.size > 0 &&
  [...masts.values()].every(
    (pair) => pair.length === 2 && Math.sign(pair[0]) !== Math.sign(pair[1]),
  )

const splay =
  !parked &&
  offsets.length > 0 &&
  everyMastOpensApart &&
  Math.abs(mean) <= SPLAY_MEAN_LIMIT &&
  Math.min(...offsets.map((o) => Math.abs(o.offset))) >= SPLAY_MIN_MAGNITUDE &&
  Math.max(...irreducible) <= TOLERANCE

if (splay) {
  console.log(
    `\nEvery mast is opened apart — its two wings offset in opposite directions, mean ${mean.toFixed(1)}°` +
      ` over magnitudes of ${Math.min(...offsets.map((o) => Math.abs(o.offset))).toFixed(0)}° and more,` +
      ` with at most ${Math.max(...irreducible).toFixed(1)}° that no beta angle could remove.` +
      '\nThe wings could face the Sun from where the alpha joints have put them and do not, so this is' +
      '\nnot a mispointing of the alpha chain. Whether it is the station opening its masts or the zero' +
      '\nof every beta joint being out by that much is the question the log below exists to settle.',
  )
}

// The station's own tracking is not perfect and neither is a TLE a few hours old, so this is not
// asking for zero. It is asking that no wing be somewhere else entirely, which is the failure the
// last three rounds of this work kept producing.
for (const binding of wings) {
  const published = telemetry.get(binding.pui)
  if (published === undefined) continue
  const off = offSun(blanketNormal(binding))
  if (off <= TOLERANCE) continue
  if (parked) {
    console.log(`  note  ${binding.node} is ${off.toFixed(1)}° off the Sun — the arrays are parked, not mispointed`)
  } else if (splay) {
    console.log(
      `  note  ${binding.node} is ${off.toFixed(1)}° off the Sun — masts opened apart, deliberately` +
        ' or by a zero error; see below',
    )
  } else {
    fail(`${binding.node} is ${off.toFixed(1)}° off the Sun, over the ${TOLERANCE}° tolerance`)
  }
}

// Both wings of a module publish mirrored angles, and so must end up pointing the same way. This
// catches a swapped pair, which the off-Sun test alone would miss when both are wrong together.
const spreadAcrossWings =
  Math.max(...wings.map((b) => offSun(blanketNormal(b)))) -
  Math.min(...wings.map((b) => offSun(blanketNormal(b))))
if (spreadAcrossWings > 10) {
  fail(`the eight wings disagree by ${spreadAcrossWings.toFixed(1)}° about where the Sun is`)
}

/*
 * The question the splay guard above cannot answer on its own.
 *
 * When every wing sits well off the Sun, two explanations fit the same instant. The station may be
 * opening its masts apart on purpose — the guard's case — or the zero of every beta joint may be
 * out by that amount, which is the last unverified assumption in the joint mapping: the rest pose
 * comes from the model, and nothing has ever confronted it with the sky. A constant error would
 * even wear the guard's signature, because the model's rest orientations are already mirrored
 * between the two wings of a mast, so one offset appears as +d on one and -d on the other.
 *
 * What separates them is not visible in a snapshot. A zero error is a constant: the same offset at
 * every beta. A deliberate off-point tracks beta — it exists to stop one blanket shadowing the next,
 * which only happens as the Sun climbs out of the orbital plane, and it vanishes at low beta.
 *
 * So each run appends what it measured, and once the log spans enough beta the answer falls out of
 * the spread. Beta moves a few degrees a day over a roughly two-month cycle; a handful of runs
 * across a week is enough.
 *
 * The alpha joints need none of this and are already settled: `best reachable` is what no beta angle
 * can remove, so it belongs to the alpha chain alone, and it reads a degree or two.
 */
const LOG = new URL('../data/array-offsets.jsonl', import.meta.url)
const magnitudes = offsets.map((o) => Math.abs(o.offset)).sort((a, b) => a - b)
const median = magnitudes[Math.floor(magnitudes.length / 2)]

const sample = {
  at: at.toISOString(),
  beta: Number(beta.toFixed(2)),
  shadow: Number(orbit.shadow.toFixed(2)),
  medianOffset: Number(median.toFixed(2)),
  worstIrreducible: Number(Math.max(...irreducible).toFixed(2)),
  parked,
}
mkdirSync(new URL('.', LOG), { recursive: true })
appendFileSync(LOG, `${JSON.stringify(sample)}\n`)

const history = readFileSync(LOG, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((s) => !s.parked)

console.log(`\nBeta against off-Sun offset — ${history.length} sample(s) in data/array-offsets.jsonl`)
for (const s of history.slice(-8)) {
  console.log(
    `  ${s.at.slice(0, 16).replace('T', ' ')}  |beta| ${Math.abs(s.beta).toFixed(1).padStart(5)}°` +
      `  offset ${s.medianOffset.toFixed(1).padStart(5)}°  ${s.shadow >= 0.5 ? 'eclipse' : 'sunlit'}`,
  )
}

const betas = history.map((s) => Math.abs(s.beta))
const betaSpread = betas.length ? Math.max(...betas) - Math.min(...betas) : 0

if (betaSpread < 8) {
  console.log(
    `\n  Not settled yet: these samples span ${betaSpread.toFixed(1)}° of |beta|, and it takes about` +
      '\n  8° to tell a constant offset from one that follows the Sun out of the orbital plane.' +
      '\n  Run this again over the coming days.',
  )
} else {
  const low = history.filter((s) => Math.abs(s.beta) <= Math.min(...betas) + betaSpread / 3)
  const high = history.filter((s) => Math.abs(s.beta) >= Math.max(...betas) - betaSpread / 3)
  const mean = (xs) => xs.reduce((sum, s) => sum + s.medianOffset, 0) / xs.length
  const lowMean = mean(low)
  const highMean = mean(high)
  console.log(
    `\n  low |beta| (${low.length} samples): offset ${lowMean.toFixed(1)}°` +
      `\n  high |beta| (${high.length} samples): offset ${highMean.toFixed(1)}°`,
  )
  console.log(
    Math.abs(highMean - lowMean) < 4
      ? '\n  The offset does not follow beta. That is the signature of a zero error in the beta\n' +
          '  joints, not of a deliberate off-point — the mapping needs correcting by that amount.'
      : '\n  The offset follows beta, which is what a deliberate off-point does and a constant zero\n' +
          '  error cannot. The joint zeros are exonerated.',
  )
}

console.log(
  failures === 0
    ? '\nAll checks pass.'
    : `\n${failures} check${failures === 1 ? '' : 's'} failed.`,
)
process.exit(failures === 0 ? 0 : 1)
