/**
 * Prepares NASA's 3D model for the web.
 *
 * Source: "International Space Station (ISS).glb" from the (D) IGOAL model, published by NASA at
 * github.com/nasa/NASA-3D-Resources — 91.4 MB, free of copyright.
 *
 * The original file is unusable as-is on a web page, for an unexpected reason: its 63.8 MB of
 * textures are duplicated, each image stored both as WebP and as a PNG fallback. Removing them
 * brings textures down to 4 MB. All the remaining weight is geometry: 2.7 million triangles, which
 * are welded, simplified, then recompressed with Draco.
 *
 * What must survive the pipeline: the 580 named nodes — they carry the clickable modules — and the
 * twelve joints (SARJ, BGA, TRRJ) the application drives from telemetry.
 *
 * This runs on @gltf-transform's JavaScript API rather than its command-line tool. The CLI pulls
 * in an argument parser whose dependency chain (caporal → glob → minimatch → brace-expansion)
 * carries permanent high-severity advisories with no non-breaking fix — `npm audit fix --force`
 * "resolves" them by downgrading the CLI two major versions. The API does the same work with none
 * of that, and the steps below are the same transforms the CLI would have invoked.
 *
 * Usage: node scripts/build-iss-model.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, prune, simplify, textureCompress, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(root, 'data/nasa-models/iss-igoal-source.glb')
const TARGET = resolve(root, 'public/models/iss-igoal.glb')
const SOURCE_URL =
  'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/International%20Space%20Station%20(ISS)%20(D)%20(IGOAL)/International%20Space%20Station%20(ISS).glb'

if (!existsSync(SOURCE)) {
  console.error(`source missing: ${SOURCE}`)
  console.error(`download it from:\n  ${SOURCE_URL}`)
  process.exit(2)
}

mkdirSync(dirname(TARGET), { recursive: true })

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

/**
 * Reading and writing needs the WebP extension (the source stores its textures that way) and
 * both Draco modules — the decoder to read the source, which is already Draco-compressed, and
 * the encoder for the final step.
 */
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })

await MeshoptSimplifier.ready

/** One pipeline step, with the reason it earns its place. */
const STEPS = [
  { name: 'dedup', why: 'strictly identical resources', transform: dedup() },
  { name: 'prune', why: 'unused elements and redundant PNG textures', transform: prune() },
  {
    name: 'resize',
    why: 'textures capped at 1024 px',
    // No target format: the images stay WebP, they are only scaled down.
    transform: textureCompress({ encoder: sharp, resize: [1024, 1024] }),
  },
  {
    name: 'weld',
    why: 'welded vertices, a precondition for good simplification',
    transform: weld(),
  },
  {
    name: 'simplify',
    why: 'lighter geometry',
    transform: simplify({ simplifier: MeshoptSimplifier, ratio: 0.15, error: 0.02 }),
  },
  { name: 'draco', why: 'final compression', transform: draco() },
]

console.log(`source: ${mb(statSync(SOURCE).size)}\n`)

const document = await io.read(SOURCE)

for (const step of STEPS) {
  process.stdout.write(`${step.name.padEnd(10)} ${step.why}… `)
  await document.transform(step.transform)
  // Serialising after each step is what makes the 63.8 MB of duplicate textures visible; the
  // intermediate writes are cheap because Draco only runs at the end.
  console.log(mb((await io.writeBinary(document)).byteLength))
}

writeFileSync(TARGET, await io.writeBinary(document))

// The source marks 19 materials BLEND with an alpha of 1, which makes three.js treat them as
// transparent and draw them out of depth order — modules end up looking see-through. This is a
// fault in the published model, not in the steps above, so it is corrected here rather than
// worked around at render time.
process.stdout.write('\nalpha modes… ')
execFileSync('node', [resolve(root, 'scripts/fix-alpha-modes.mjs'), TARGET], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
})
console.log('corrected')

// Verification: the model is only worth its structure, not merely its size.
const buffer = readFileSync(TARGET)
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

const nodes = json?.nodes ?? []
const named = nodes.filter((node) => node.name).length
const pivots = nodes.filter((node) => /ALPHA_ROT|BETA_ROT|TRRJ_GAMMA_ROT/.test(node.name ?? ''))

console.log(`\nresult: ${TARGET}`)
console.log(`  size        : ${mb(buffer.length)}`)
console.log(`  named nodes : ${named} / ${nodes.length}`)
console.log(`  joints found: ${pivots.length} / 12`)

if (pivots.length !== 12) {
  console.error('\nthe expected joints are not all present — model unusable as-is')
  process.exit(1)
}
console.log('\nModel ready.')
