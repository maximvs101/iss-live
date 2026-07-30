/**
 * Works out which local axis each joint actually turns about.
 *
 * Guessing this is how solar wings end up pointing in impossible directions. The reliable clue is
 * geometric: a beta joint carries a wing that extends along its own mast and turns about that same
 * mast, so the direction its children extend in — expressed in the joint's own frame — is the axis
 * of rotation. An alpha joint carries the outboard truss and turns about the truss axis, which is
 * the direction of the segment it holds rather than the span of the wings hanging off it.
 *
 * Node transforms are composed in full (translation, rotation, scale). Composing translations
 * alone, as a first version of this script did, gives confident and wrong answers.
 *
 * Usage: node scripts/inspect-joints.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buffer = readFileSync(resolve(root, 'public/models/iss-igoal.glb'))

let offset = 12
let json = null
while (offset < buffer.length) {
  const length = buffer.readUInt32LE(offset)
  const type = buffer.readUInt32LE(offset + 4)
  if (type === 0x4e4f534a) {
    json = JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString('utf8'))
  }
  offset += 8 + length + ((4 - (length % 4)) % 4)
}

const nodes = json.nodes ?? []
const meshes = json.meshes ?? []
const accessors = json.accessors ?? []

/** Column-major 4x4, as in glTF. */
function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

function multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = sum
    }
  }
  return out
}

/** Local matrix of a node, from its matrix or its TRS components. */
function localMatrix(node) {
  if (node.matrix) return node.matrix.slice()

  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]

  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

/** The eight corners of a mesh's local bounds. */
function meshCorners(meshIndex) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const primitive of meshes[meshIndex]?.primitives ?? []) {
    const position = accessors[primitive.attributes?.POSITION]
    if (!position?.min || !position?.max) continue
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], position.min[i])
      max[i] = Math.max(max[i], position.max[i])
    }
  }
  if (!Number.isFinite(min[0])) return []
  const corners = []
  for (const cx of [min[0], max[0]]) {
    for (const cy of [min[1], max[1]]) {
      for (const cz of [min[2], max[2]]) corners.push([cx, cy, cz])
    }
  }
  return corners
}

/** Bounds of a subtree, expressed in the frame of the node the walk started from. */
function subtreeBounds(index, parentMatrix, acc) {
  const node = nodes[index]
  if (!node) return
  const world = multiply(parentMatrix, localMatrix(node))

  if (node.mesh !== undefined) {
    for (const corner of meshCorners(node.mesh)) {
      const p = transformPoint(world, corner)
      for (let i = 0; i < 3; i += 1) {
        acc.min[i] = Math.min(acc.min[i], p[i])
        acc.max[i] = Math.max(acc.max[i], p[i])
      }
    }
  }
  for (const child of node.children ?? []) subtreeBounds(child, world, acc)
}

const JOINTS = nodes
  .map((node, index) => ({ node, index }))
  .filter((entry) => /ALPHA_ROT|BETA_ROT|TRRJ_GAMMA_ROT/.test(entry.node.name ?? ''))

console.log('Children bounds in each joint\'s own frame (rotations composed)\n')
console.log('joint                     size X      Y      Z    centre X      Y      Z    axis')

for (const { node } of JOINTS) {
  const acc = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  for (const child of node.children ?? []) subtreeBounds(child, identity(), acc)

  if (!Number.isFinite(acc.min[0])) {
    console.log(`${node.name.padEnd(22)} (no geometry)`)
    continue
  }

  const size = [0, 1, 2].map((i) => acc.max[i] - acc.min[i])
  const centre = [0, 1, 2].map((i) => (acc.max[i] + acc.min[i]) / 2)

  // The axis the children extend along: the one carrying the largest offset of their centre.
  const axisIndex = centre.map(Math.abs).indexOf(Math.max(...centre.map(Math.abs)))
  const axis = ['x', 'y', 'z'][axisIndex]

  console.log(
    `${node.name.padEnd(22)} ${size.map((v) => v.toFixed(0).padStart(6)).join(' ')}  ` +
      `${centre.map((v) => v.toFixed(0).padStart(6)).join(' ')}   ${axis}`,
  )
}
