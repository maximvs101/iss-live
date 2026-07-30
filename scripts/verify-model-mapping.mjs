/**
 * Checks the mapping table against the real structure of the 3D model.
 *
 * Four failures are possible, and the render alone tells you little about any of them:
 *  - a joint whose node is missing, so nothing moves;
 *  - a named element the mapping never claims, so hovering it reports whichever ancestor happens
 *    to match — this is how a module can appear to swallow half the station;
 *  - a geometry node no rule reaches at all, so clicking it does nothing;
 *  - a material shared between unrelated parts, so tinting one part tints the others. This one
 *    looks exactly like a mapping error from the outside and is not one: the first three checks
 *    passed at 100 % while hovering Zvezda highlighted most of the ISS.
 *
 * Usage: node scripts/verify-model-mapping.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { JOINT_BINDINGS, MAPPED_ELEMENT_NAMES, partOfNode } from '../src/scene/nasa/nodeMapping.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL = resolve(root, 'public/models/iss-igoal.glb')

const buffer = readFileSync(MODEL)
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
let failures = 0

console.log(`model: ${(buffer.length / 1024 / 1024).toFixed(2)} MB, ${nodes.length} nodes\n`)

console.log('1. Joints')
for (const binding of JOINT_BINDINGS) {
  const found = nodes.some((candidate) => candidate.name === binding.node)
  if (!found) failures += 1
  console.log(`  [${found ? 'ok  ' : 'FAIL'}] ${binding.node} ← ${binding.pui} (${binding.axis})`)
}

console.log('\n2. Assembly elements')
// The model is organised the way the station was assembled: every element is a direct child of
// the scene root. Any of them the mapping does not claim would be absorbed by a neighbour.
const parentOf = new Map()
nodes.forEach((node, index) => {
  for (const child of node.children ?? []) parentOf.set(child, index)
})
const rootIndex = nodes.findIndex((node) => !parentOf.has(node.name ? nodes.indexOf(node) : -1) && node.children)
const sceneRoot = json.scenes?.[json.scene ?? 0]?.nodes?.[0] ?? rootIndex
const topLevel = (nodes[sceneRoot]?.children ?? []).map((index) => nodes[index]?.name).filter(Boolean)

const unclaimed = topLevel.filter((name) => !partOfNode(name))
console.log(`  ${topLevel.length - unclaimed.length} / ${topLevel.length} top-level elements mapped`)
if (unclaimed.length > 0) {
  failures += 1
  console.log(`  [FAIL] never claimed: ${unclaimed.join(', ')}`)
} else {
  console.log('  [ok  ] every assembly element is claimed by name')
}

const missingNodes = MAPPED_ELEMENT_NAMES.filter(
  (name) => !nodes.some((node) => node.name === name),
)
if (missingNodes.length > 0) {
  failures += 1
  console.log(`  [FAIL] mapped names absent from the model: ${missingNodes.join(', ')}`)
} else {
  console.log('  [ok  ] every mapped name exists in the model')
}

console.log('\n3. Coverage of geometry-bearing nodes')
const resolvePart = (index) => {
  let current = index
  while (current !== undefined) {
    const name = nodes[current]?.name
    const part = name ? partOfNode(name) : null
    if (part) return part
    current = parentOf.get(current)
  }
  return null
}

const withMesh = nodes
  .map((node, index) => ({ node, index }))
  .filter((entry) => entry.node.mesh !== undefined)

const covered = new Map()
const orphans = []
for (const entry of withMesh) {
  const part = resolvePart(entry.index)
  if (part) covered.set(part, (covered.get(part) ?? 0) + 1)
  else orphans.push(entry.node.name)
}

const rate = ((withMesh.length - orphans.length) / withMesh.length) * 100
console.log(`  ${withMesh.length - orphans.length} / ${withMesh.length} nodes mapped (${rate.toFixed(0)} %)`)
console.log(`  ${covered.size} distinct parts recognised`)
if (orphans.length > 0) {
  failures += 1
  console.log(`  [FAIL] unreachable nodes: ${orphans.slice(0, 20).join(', ')}`)
}

console.log('\n4. Material sharing between parts')
// The fourth failure mode, and the only one invisible to every check above: the file reuses a
// small set of materials across unrelated parts. Highlighting works by tinting a material, so
// unless the renderer gives each mesh its own copy, hovering one module tints every module drawn
// with the same material. All three checks above passed at 100 % while hovering Zvezda lit up
// most of the station.
const partsPerMaterial = new Map()
for (const entry of withMesh) {
  const part = resolvePart(entry.index)
  if (!part) continue
  for (const primitive of json.meshes?.[entry.node.mesh]?.primitives ?? []) {
    if (primitive.material === undefined) continue
    if (!partsPerMaterial.has(primitive.material)) partsPerMaterial.set(primitive.material, new Set())
    partsPerMaterial.get(primitive.material).add(part)
  }
}

const shared = [...partsPerMaterial.entries()]
  .map(([material, parts]) => ({ name: json.materials?.[material]?.name ?? `#${material}`, parts: parts.size }))
  .filter((entry) => entry.parts > 1)
  .sort((a, b) => b.parts - a.parts)

console.log(`  ${json.materials?.length ?? 0} materials for ${withMesh.length} geometry nodes`)
if (shared.length === 0) {
  console.log('  [ok  ] no material is shared between parts')
} else {
  console.log(`  ${shared.length} material(s) shared across parts, worst first:`)
  for (const entry of shared.slice(0, 5)) {
    console.log(`    ${entry.name.padEnd(24)} used by ${entry.parts} different parts`)
  }

  // The renderer has to compensate. Checking the source is crude, but it is what stands between
  // this file's structure and the bug coming back unnoticed.
  const renderer = readFileSync(resolve(root, 'src/scene/nasa/IssGltf.tsx'), 'utf8')
  const clones = /material\.clone\(\)|material\.map\(\(material\) => material\.clone\(\)\)/.test(renderer)
  if (clones) {
    console.log('  [ok  ] IssGltf gives each mesh its own material copy')
  } else {
    failures += 1
    console.log('  [FAIL] IssGltf does not clone materials — highlighting will bleed across parts')
  }
}

console.log('\n5. Alpha modes')
// A material declared BLEND with a base colour alpha of 1 makes three.js treat the mesh as
// transparent, which takes it out of ordinary depth sorting; nested geometry then draws in the
// wrong order and the module looks see-through. The source model ships 19 of these. They are
// corrected by `npm run fix:alpha`, and this catches the correction being lost in a rebuild.
const blendMaterials = (json.materials ?? []).filter((m) => m.alphaMode === 'BLEND')
const opaqueLookingBlend = blendMaterials.filter(
  (m) => ((m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1])[3] === 1) && !m.pbrMetallicRoughness?.baseColorTexture,
)
const counts = { BLEND: blendMaterials.length, MASK: 0, OPAQUE: 0 }
for (const m of json.materials ?? []) {
  const mode = m.alphaMode ?? 'OPAQUE'
  if (mode === 'MASK') counts.MASK += 1
  else if (mode === 'OPAQUE') counts.OPAQUE += 1
}
console.log(`  ${counts.OPAQUE} opaque, ${counts.MASK} masked, ${counts.BLEND} blended`)

if (opaqueLookingBlend.length > 0) {
  failures += 1
  console.log(
    `  [FAIL] ${opaqueLookingBlend.length} material(s) blend with no texture and full alpha — run npm run fix:alpha: ${opaqueLookingBlend.map((m) => m.name).join(', ')}`,
  )
} else if (counts.BLEND > 12) {
  failures += 1
  console.log(`  [FAIL] ${counts.BLEND} blended materials — the source ships 19; the alpha-mode fix looks unapplied`)
} else {
  console.log('  [ok  ] no material blends without needing to')
}

console.log('\n6. Parts by size')
for (const [part, count] of [...covered].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${part.padEnd(20)} ${String(count).padStart(3)} node(s)`)
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nMapping is consistent with the model.')
