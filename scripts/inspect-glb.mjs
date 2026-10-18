/**
 * Inspects a GLB file: node hierarchy, geometry, materials, textures.
 *
 * It answers the only question that matters before adopting a model: are its parts separate,
 * named nodes? Without that, no clicking a module to select it and no rotating a solar wing from
 * telemetry — the model would be nothing but a picture.
 *
 * Usage: node scripts/inspect-glb.mjs <file.glb> [--tree]
 */
import { readFileSync } from 'node:fs'
import { parseGlb } from './lib/glb.mjs'

const file = process.argv[2]
const showTree = process.argv.includes('--tree')
if (!file) {
  console.error('usage: node scripts/inspect-glb.mjs <file.glb> [--tree]')
  process.exit(2)
}

const buffer = readFileSync(file)

// GLB header: magic "glTF", version, total length.
const magic = buffer.readUInt32LE(0)
if (magic !== 0x46546c67) {
  console.error('this file is not a GLB')
  process.exit(2)
}
const version = buffer.readUInt32LE(4)
const totalLength = buffer.readUInt32LE(8)

let json
let binLength
try {
  const glb = parseGlb(buffer)
  json = glb.json
  binLength = glb.bin?.length ?? 0
} catch (error) {
  console.error(error.message)
  process.exit(2)
}

const nodes = json.nodes ?? []
const meshes = json.meshes ?? []
const accessors = json.accessors ?? []

console.log(`\nfile      : ${file}`)
console.log(`glTF      : version ${version}, ${(totalLength / 1024 / 1024).toFixed(2)} MB`)
console.log(`generator : ${json.asset?.generator ?? 'not stated'}`)
console.log(`bin buffer: ${(binLength / 1024 / 1024).toFixed(2)} MB`)
console.log(`extensions: ${(json.extensionsUsed ?? []).join(', ') || 'none'}`)

// Triangle count, from the index accessors.
let triangles = 0
let primitives = 0
for (const mesh of meshes) {
  for (const primitive of mesh.primitives ?? []) {
    primitives += 1
    if (primitive.indices !== undefined) {
      triangles += (accessors[primitive.indices]?.count ?? 0) / 3
    } else if (primitive.attributes?.POSITION !== undefined) {
      triangles += (accessors[primitive.attributes.POSITION]?.count ?? 0) / 3
    }
  }
}

console.log(`\nnodes     : ${nodes.length}`)
console.log(`meshes    : ${meshes.length} (${primitives} primitives)`)
console.log(`triangles : ${Math.round(triangles).toLocaleString('en-GB')}`)
console.log(`materials : ${(json.materials ?? []).length}`)
console.log(`textures  : ${(json.textures ?? []).length}`)
console.log(`animations: ${(json.animations ?? []).length}`)
console.log(`skins     : ${(json.skins ?? []).length}`)

const named = nodes.filter((node) => node.name)
console.log(`\nnamed nodes: ${named.length} / ${nodes.length}`)

// A node that both carries a mesh and has a name is a potentially selectable part.
const selectable = nodes.filter((node) => node.name && node.mesh !== undefined)
console.log(`named nodes carrying a mesh: ${selectable.length}`)

if (named.length > 0) {
  console.log('\nnode names:')
  for (const node of named.slice(0, 80)) {
    const kind = node.mesh !== undefined ? 'mesh' : node.children ? 'group' : 'empty'
    const children = node.children ? ` (${node.children.length} children)` : ''
    console.log(`  ${node.name}  [${kind}]${children}`)
  }
  if (named.length > 80) console.log(`  … and ${named.length - 80} more`)
}

if (showTree) {
  console.log('\nhierarchy:')
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? []
  const walk = (index, depth) => {
    const node = nodes[index]
    if (!node) return
    const label = node.name ?? `<unnamed #${index}>`
    const mesh = node.mesh !== undefined ? ` · mesh ${node.mesh}` : ''
    console.log(`${'  '.repeat(depth)}${label}${mesh}`)
    for (const child of node.children ?? []) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 1)
}
