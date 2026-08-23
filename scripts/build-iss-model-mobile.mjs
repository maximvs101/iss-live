/**
 * A second copy of the station, small enough for a phone to hold in memory.
 *
 * The desktop model is 14.9 MB on the wire and that was never the problem. What a phone cannot
 * survive is what it becomes once decoded, measured from the file itself:
 *
 *     108 textures at 1024x1024, decoded to RGBA      434 MB
 *     the same with mipmaps                           577 MB
 *     4.81 M vertices: position, normal, uv, indices  162 MB
 *     -------------------------------------------------------
 *                                                     739 MB
 *
 * iOS ends a tab's renderer somewhere between 250 and 400 MB, and every browser on the platform is
 * WebKit underneath — Chrome on an iPhone included. So this is not a slow load, it is an execution
 * that cannot finish, which is what "Chrome crashes" means here.
 *
 * One lever, and only one is available. Textures drop to 256 — a sixteenth of the pixels, which
 * takes 577 MB to 37 — and the geometry cannot follow. It is CAD-derived and hard-edged, 2.5
 * vertices per triangle because every face owns its normals, so `weld` finds nothing identical to
 * merge and the simplifier has no shared edges to collapse: asked for a third of the triangles at
 * an error budget of 0.25 it returned 97 % of them, for minutes of work.
 *
 * Meshopt was the other candidate, since it is the one compression that carries quantization
 * through to the buffer the GPU holds — 160 MB of float32 attributes would have become about 70.
 * It was rejected on measurement: the file grew to 30 MB, and the node count went from 580 to 751
 * because quantizing shared meshes inserts scaling nodes. Those nodes are the clickable modules
 * and the twelve driven joints. The check at the end of this file is what caught it.
 *
 * Derived from `public/models/iss-igoal.glb` rather than from NASA's 91 MB original, so it needs
 * nothing that is not in the repository. The named nodes and the twelve driven joints are untouched
 * — simplification moves vertices, never the node graph.
 *
 * Usage: npm run build:model:mobile
 */
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, prune, textureCompress } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(root, 'public/models/iss-igoal.glb')
const TARGET = resolve(root, 'public/models/iss-igoal-mobile.glb')

/** A sixteenth of the pixels of the desktop model's 1024, and the whole point of the file. */
const TEXTURE_SIZE = Number(process.env.TEXTURE_SIZE ?? 256)

if (!existsSync(SOURCE)) {
  console.error(`source missing: ${SOURCE}\nrun \`npm run build:model\` first`)
  process.exit(2)
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

/*
 * Both Draco modules: the decoder to read the source, which is already compressed, and the encoder
 * to write the result the same way.
 */
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
})

const document = await io.read(SOURCE)

const before = {
  nodes: document.getRoot().listNodes().length,
  meshes: document.getRoot().listMeshes().length,
  textures: document.getRoot().listTextures().length,
}

await document.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, resize: [TEXTURE_SIZE, TEXTURE_SIZE] }),
  draco(),
)

await io.write(TARGET, document)

const after = {
  nodes: document.getRoot().listNodes().length,
  meshes: document.getRoot().listMeshes().length,
  textures: document.getRoot().listTextures().length,
}
console.log(`${statSync(SOURCE).size ? mb(statSync(SOURCE).size) : '?'} -> ${mb(statSync(TARGET).size)}`)
console.log(`nodes    ${before.nodes} -> ${after.nodes}`)
console.log(`meshes   ${before.meshes} -> ${after.meshes}`)
console.log(`textures ${before.textures} -> ${after.textures} at ${TEXTURE_SIZE}px`)

/*
 * The node count is the one that must not move. Every clickable module and all twelve driven
 * joints are named nodes; a transform that dropped one would take a module out of the inspector
 * and a joint out of the telemetry mapping, and neither failure announces itself on screen.
 */
if (after.nodes !== before.nodes) {
  console.error(`\nnode count changed: ${before.nodes} -> ${after.nodes}. The joints and the clickable parts live on those nodes.`)
  process.exit(1)
}
console.log('\nnode graph intact.')
