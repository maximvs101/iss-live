/**
 * Where the solar arrays point, rebuilt from the model rather than from a formula.
 *
 * Extracted so that two callers share one implementation: `verify:arrays`, which asks the question
 * of a live session, and `analyse:offset`, which asks it of every minute the collector recorded.
 *
 * That split is the whole reason this file exists. The first attempt at the second caller derived
 * the geometry by hand — a truss axis, a mast swung by the alpha angle, a normal rotated by the
 * beta angle — and came out at 45° to 90° off-Sun where the verified script reads 10° to 20°. The
 * model is not a formula: `Truss_S6` carries a uniform scale of 63.33 and the joints beneath it
 * 0.016, the beta joints sit under four differently-oriented truss segments, and every one of those
 * facts is in the file and in none of the arithmetic. `nodeMapping` already says this about
 * `jointAngle` — "the two carried their own copy of this arithmetic for a while, and both times the
 * rule changed, one of them was left behind". This is the same lesson, one level up.
 */
import { readFileSync } from 'node:fs'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { propagateIss, betaAngle, sunDirectionLvlh } from '../../src/orbit/propagator.ts'
import { JOINT_BINDINGS, jointAngle } from '../../src/scene/nasa/nodeMapping.ts'

// Resolved against this file, not the working directory: run from the wrong folder and a relative
// path fails with a missing-module error that says nothing about the real mistake.
const MODEL = new URL('../../public/models/iss-igoal.glb', import.meta.url)

/** Rotation the component applies to bring the model into the scene frame. */
// +X starboard, +Y zenith, +Z aft — matches the `rotation` prop in IssGltf.
export const MODEL_ROTATION = new Quaternion().setFromEuler(new Euler(0, -Math.PI / 2, 0))

/**
 * The blanket's normal, in the beta joint's own frame.
 *
 * Local X, confirmed two ways: principal components over the vertex cloud, and the wing's extent
 * in its own frame, which comes out 244 × 449 × 1392 — thinnest on X by a factor of nearly two.
 */
export const BLANKET_NORMAL = new Vector3(1, 0, 0)

export const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) }

// ---------------------------------------------------------------- the model

const buffer = readFileSync(MODEL)
const jsonLength = buffer.readUInt32LE(12)
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'))

/** node index -> { name, local, children, parent } */
export const nodes = gltf.nodes.map((node, index) => {
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

export const byName = new Map(nodes.map((node) => [node.name, node]))

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
export function worldMatrix(node) {
  const chain = []
  for (let n = node; n; n = n.parent >= 0 ? nodes[n.parent] : null) chain.unshift(n)
  const out = new Matrix4().makeRotationFromQuaternion(MODEL_ROTATION)
  for (const n of chain) out.multiply(n.applied ?? n.local)
  return out
}

/** Sets a joint to `angle` degrees the way the component does: rest, zero offset, then the angle. */
export function setJoint(binding, angle) {
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
export function blanketNormal(binding) {
  const world = worldMatrix(byName.get(binding.node))
  return BLANKET_NORMAL.clone().transformDirection(world).normalize()
}

/** The eight beta joints, in the order `nodeMapping` declares them. */
export const WINGS = JOINT_BINDINGS.filter((binding) => binding.node.includes('BETA_ROT'))

// ------------------------------------------------------- the Sun, and the wings

/** Where the station is and where the Sun is from it, at one instant. */
export function geometryAt(satrec, date) {
  const orbit = propagateIss(satrec, date)
  if (!orbit) return null
  return {
    orbit,
    beta: betaAngle(orbit, date),
    sun: new Vector3(...sunDirectionLvlh(orbit, date)).normalize(),
  }
}

/** Angle between a normal and the Sun, taking the blanket as two-sided. */
export const offSunOf = (normal, sun) =>
  (Math.acos(Math.min(1, Math.abs(normal.dot(sun)))) * 180) / Math.PI

/**
 * One wing, at one instant: where it points, and where it would have to be to face the Sun.
 *
 * `ideal` is found by sweeping the joint rather than by algebra, so it assumes nothing about which
 * way the joint turns. `irreducible` is what no beta angle can remove — large there means the
 * residual belongs to the alpha chain and not to this joint.
 *
 * The joint is left where the telemetry put it, so callers can measure several wings in any order.
 */
export function measureWing(binding, published, sun, step = 0.25) {
  setJoint(binding, published)
  const off = offSunOf(blanketNormal(binding), sun)

  let best = { angle: null, off: Infinity }
  for (let angle = 0; angle < 360; angle += step) {
    setJoint(binding, angle)
    const candidate = offSunOf(blanketNormal(binding), sun)
    if (candidate < best.off) best = { angle, off: candidate }
  }
  setJoint(binding, published)

  // The joint is two-sided, so an offset of +d and one of d-180 are the same pose. Report the
  // smaller, otherwise half the wings read 180° apart for no physical reason.
  let offset = best.angle - published
  offset = (((offset % 180) + 270) % 180) - 90

  return { node: binding.node, published, off, ideal: best.angle, offset, irreducible: best.off }
}

/**
 * All eight wings at one instant, given the angles the station published then.
 *
 * `angles` is a map of PUI to degrees — from a live session or from a stored row, it makes no
 * difference here, which is the point of this function existing.
 */
export function measureAll(angles, sun, step = 0.25) {
  for (const binding of JOINT_BINDINGS) {
    const angle = angles.get(binding.pui)
    if (angle !== undefined) setJoint(binding, angle)
  }
  const measured = []
  for (const binding of WINGS) {
    const published = angles.get(binding.pui)
    if (published === undefined) continue
    measured.push(measureWing(binding, published, sun, step))
  }
  return measured
}
