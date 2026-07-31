/**
 * Checks where the solar arrays are actually pointing, against where the Sun actually is.
 *
 * This exists because the 3D scene cannot answer the question honestly. Measuring it in the
 * browser needs the render loop, and the render loop stops whenever the window is not the one in
 * front — twice now a set of readings turned out to have been taken from a frozen frame, with the
 * Sun still sitting at three.js's default `(0, 1, 0)`. Here the same geometry is rebuilt from the
 * glTF file and the same solar vector from the same propagator, with nothing that can silently
 * stop running.
 *
 * What it reports, per wing:
 *
 *   off-Sun      the angle between the blanket's normal and the Sun. Zero is face-on.
 *   ideal BGA    the beta angle that would put the blanket face-on, given the alpha angle the
 *                station is publishing. Found by sweeping, not by algebra, so it makes no
 *                assumption about which way the joint turns.
 *   offset       ideal minus published. A constant across all eight wings, holding still as the
 *                geometry changes, means the model's rest pose is not the joint's zero — a rigging
 *                constant. Something that moves with the orbit means the station is off-pointing
 *                its arrays on purpose, which NASA documents it doing.
 *
 * Usage: node scripts/verify-array-pointing.mjs [--samples 1]
 */
import { readFileSync } from 'node:fs'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { twoline2satrec } from 'satellite.js'
import { propagateIss, betaAngle, sunDirectionLvlh } from '../src/orbit/propagator.ts'
import { JOINT_BINDINGS } from '../src/scene/nasa/nodeMapping.ts'

const MODEL = 'public/models/iss-igoal.glb'
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

/** Resting orientation of each joint, taken from the file before anything is applied. */
for (const node of nodes) node.rest = new Quaternion().setFromRotationMatrix(node.local)

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
        (((binding.sign ?? 1) * angle + (binding.zero ?? 0)) * Math.PI) / 180,
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

// ------------------------------------------------------------------ the Sun

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
  offsets.push(offset)

  const name = binding.node.replace('_BETA_ROT', '').replace('PORT_', 'P ').replace('STBD_', 'S ')
  console.log(
    `${name.padEnd(10)} ${published.toFixed(1).padStart(8)}° ${before.toFixed(1).padStart(8)}° ` +
      `${best.angle.toFixed(1).padStart(10)}° ${offset.toFixed(1).padStart(7)}° ` +
      `${best.off.toFixed(1).padStart(13)}°`,
  )
}

const mean = offsets.reduce((sum, value) => sum + value, 0) / offsets.length
const spread = Math.max(...offsets) - Math.min(...offsets)
console.log(`\nrequired offset: mean ${mean.toFixed(1)}°, spread across the eight wings ${spread.toFixed(1)}°`)
console.log(`|beta| is ${Math.abs(beta).toFixed(1)}° — ideal Sun-pointing needs |BGA| to equal it.`)
