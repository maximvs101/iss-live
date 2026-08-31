/**
 * Corrects alpha modes that the source model declares wrongly.
 *
 * NASA's IGOAL file marks 19 of its 49 materials `alphaMode: BLEND` with a base colour alpha of
 * exactly 1 — the signature of a Blender export left on its default blend mode. three.js honours
 * that by setting `transparent: true`, which pulls those meshes out of ordinary depth sorting and
 * into the transparent pass, where they are ordered by object centre. Nested geometry then draws
 * in the wrong order and the module appears see-through. Kibo is the clearest case.
 *
 * The fix cannot be applied blindly: some of these textures genuinely use their alpha channel.
 * Each base colour texture is decoded, and the decision rests on *where* the partially
 * transparent pixels are rather than how many there are — counting cannot separate these two:
 *
 *   - antialiasing along the border of a texture-atlas island. Every graded pixel then sits next
 *     to a fully transparent one, and the material is really a hard cutout.
 *   - a surface meant to be seen through, such as the Cupola windows. Graded pixels then form
 *     regions whose neighbours are opaque, with no transparent pixel anywhere near.
 *
 * So every graded pixel is tested for adjacency to a transparent one, and only the *interior*
 * ones — touching none — count as evidence of real translucency:
 *
 *   no pixel below 255                      -> OPAQUE, nothing to blend or mask
 *   graded pixels, all on transparent edges -> MASK, a hard cutout, depth-sorted as opaque
 *   interior graded regions                 -> BLEND is real, leave it alone
 *
 * A small tolerance still covers WebP compression noise, which sprinkles values like 192–254
 * across otherwise flat areas: JEM_PM has no transparent pixel at all, yet 0.26 % of it is graded.
 *
 * Usage: node scripts/fix-alpha-modes.mjs [path.glb] [--dry-run]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const TARGET = args[0] ?? resolve(root, 'public/models/iss-igoal.glb')

/**
 * Smallest connected run of deep interior pixels that counts as a deliberate translucent region.
 *
 * This is what separates IROSA from the truss. Both carry a few thousand deep pixels, but the
 * truss groups them into runs of ~400 while IROSA's largest run is 16 — scattered singletons,
 * which is compression noise rather than a surface anyone meant to see through. The Cupola, for
 * comparison, has a run of 9,705: its windows.
 */
const MIN_TRANSLUCENT_BLOB = 100

/**
 * Below this width the criterion above stops meaning what it says, so the script refuses to run.
 *
 * `MIN_TRANSLUCENT_BLOB` counts pixels, and a region of a surface covers sixteen times fewer of
 * them at a quarter of the width. Run against the 256-pixel textures of `iss-igoal-mobile.glb`,
 * this file reclassifies **6 of its 13 candidates** — Zvezda, both Node materials, Zarya and two
 * of the ELC payload sets all move — and every one of those verdicts is worse than the one it
 * would overwrite, because it was reached from less evidence.
 *
 * Nothing had ever gone wrong, and nothing was stopping it either: the mobile build happens to
 * derive from an already-corrected file and so inherits the right modes, which is an ordering
 * this script neither knew about nor enforced. Now it does. `--force` exists for a future file
 * whose textures are genuinely small and genuinely uncorrected; it does not exist for
 * convenience.
 */
const MIN_TEXTURE_WIDTH = 512

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

function readGlb(path) {
  const buffer = readFileSync(path)
  const chunks = []
  let offset = 12
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset)
    const type = buffer.readUInt32LE(offset + 4)
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) })
    offset += 8 + length + ((4 - (length % 4)) % 4)
  }
  const jsonChunk = chunks.find((c) => c.type === JSON_CHUNK)
  const binChunk = chunks.find((c) => c.type === BIN_CHUNK)
  return { json: JSON.parse(jsonChunk.data.toString('utf8')), bin: binChunk?.data ?? null }
}

function writeGlb(path, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
  // Both chunks must be padded to a four-byte boundary: JSON with spaces, BIN with zeroes.
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)])
  const binPad = bin ? (4 - (bin.length % 4)) % 4 : 0
  const binPadded = bin ? Buffer.concat([bin, Buffer.alloc(binPad, 0)]) : null

  const total = 12 + 8 + jsonPadded.length + (binPadded ? 8 + binPadded.length : 0)
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(total, 8)

  const parts = [header]
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonPadded.length, 0)
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4)
  parts.push(jsonHeader, jsonPadded)

  if (binPadded) {
    const binHeader = Buffer.alloc(8)
    binHeader.writeUInt32LE(binPadded.length, 0)
    binHeader.writeUInt32LE(BIN_CHUNK, 4)
    parts.push(binHeader, binPadded)
  }
  writeFileSync(path, Buffer.concat(parts))
}

const { json, bin } = readGlb(TARGET)

/**
 * The widest base colour texture in the file, from the image headers alone.
 *
 * The widest rather than the narrowest: one small atlas among large ones is not a downscaled
 * file, and refusing on it would be a false alarm on the very build this protects.
 */
function widestBaseTexture() {
  let widest = 0
  for (const material of json.materials ?? []) {
    const reference = material.pbrMetallicRoughness?.baseColorTexture
    if (!reference) continue
    const entry = json.textures[reference.index]
    const source = entry.extensions?.EXT_texture_webp?.source ?? entry.source
    const view = json.bufferViews[json.images[source].bufferView]
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF') continue
    const kind = bytes.subarray(12, 16).toString('ascii')
    let width = 0
    if (kind === 'VP8X') width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
    else if (kind === 'VP8L') width = (bytes.readUInt32LE(21) & 0x3fff) + 1
    else if (kind === 'VP8 ') width = bytes.readUInt16LE(26) & 0x3fff
    if (width > widest) widest = width
  }
  return widest
}

const widest = widestBaseTexture()
if (widest > 0 && widest < MIN_TEXTURE_WIDTH && !FORCE) {
  console.error(
    [
      TARGET,
      '',
      `  [refused] its base colour textures are ${widest} px wide, under the ${MIN_TEXTURE_WIDTH}`,
      '  this criterion is calibrated for. A file this size is a derived one: take its alpha',
      '  modes from the file it came from, where they were decided on full-resolution images.',
      '  See MIN_TEXTURE_WIDTH for what happens otherwise — 6 of 13 verdicts change.',
      '  Pass --force if you mean it.',
    ].join('\n'),
  )
  process.exit(2)
}

/** The image backing a texture, following the WebP extension when present. */
function imageOf(textureIndex) {
  const texture = json.textures?.[textureIndex]
  if (!texture) return null
  const source = texture.source ?? texture.extensions?.EXT_texture_webp?.source
  return source === undefined ? null : json.images[source]
}

function imageBytes(image) {
  if (!image || image.bufferView === undefined || !bin) return null
  const view = json.bufferViews[image.bufferView]
  const start = view.byteOffset ?? 0
  return bin.subarray(start, start + view.byteLength)
}

/**
 * Alpha below which an interior pixel is taken to be deliberately translucent.
 *
 * Position alone is not enough. WebP's lossy encoding scatters values like 253 and 254 through
 * flat opaque areas, and those pixels touch no transparent neighbour, so they look "interior"
 * while meaning nothing. Real translucency is far from opaque — a window sits near the middle of
 * the range, not one step off the top.
 */
const TRANSLUCENT_BELOW = 200

/**
 * Classifies graded pixels by position and depth.
 *
 * `edge` borders a fully transparent pixel — antialiasing along an atlas island, which a hard
 * cutout reproduces exactly. `interior` touches none. `interiorDeep` is the subset of interior
 * pixels far enough below opaque to be intentional, and is the only real evidence of blending.
 */
function alphaTopology(data, width, height) {
  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3]
  let transparent = 0
  let edge = 0
  let interior = 0
  let interiorDeep = 0
  const deep = new Set()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = alphaAt(x, y)
      if (a === 0) {
        transparent += 1
        continue
      }
      if (a === 255) continue

      let touchesTransparent = false
      for (let dy = -1; dy <= 1 && !touchesTransparent; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (alphaAt(nx, ny) === 0) {
            touchesTransparent = true
            break
          }
        }
      }
      if (touchesTransparent) {
        edge += 1
      } else {
        interior += 1
        if (a < TRANSLUCENT_BELOW) {
          interiorDeep += 1
          deep.add(y * width + x)
        }
      }
    }
  }

  // Largest connected run of deep pixels, four-neighbourhood. Scattered singletons are noise;
  // a translucent surface covers a contiguous area.
  let largestBlob = 0
  const visited = new Set()
  for (const start of deep) {
    if (visited.has(start)) continue
    let size = 0
    const stack = [start]
    while (stack.length) {
      const cell = stack.pop()
      if (visited.has(cell) || !deep.has(cell)) continue
      visited.add(cell)
      size += 1
      const cx = cell % width
      const cy = Math.floor(cell / width)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const neighbour = ny * width + nx
        if (deep.has(neighbour) && !visited.has(neighbour)) stack.push(neighbour)
      }
    }
    if (size > largestBlob) largestBlob = size
  }

  return { transparent, edge, interior, interiorDeep, largestBlob, total: width * height }
}

console.log(`${TARGET}${DRY_RUN ? '  (dry run)' : ''}\n`)
console.log('material                  transparent%  edge%   deep-px  largest-run   was      becomes')

let changed = 0
for (const material of json.materials ?? []) {
  const mode = material.alphaMode ?? 'OPAQUE'
  if (mode === 'OPAQUE') continue

  const pbr = material.pbrMetallicRoughness ?? {}
  const baseAlpha = (pbr.baseColorFactor ?? [1, 1, 1, 1])[3]
  const name = material.name ?? '(unnamed)'

  // A base colour alpha below 1 is deliberate: the whole surface is see-through.
  if (baseAlpha < 1) {
    console.log(`${name.padEnd(24)}  ${'—'.padStart(12)}  ${'—'.padStart(7)}   ${mode.padEnd(6)}  ${mode} (factor alpha ${baseAlpha})`)
    continue
  }

  const bytes = imageBytes(imageOf(pbr.baseColorTexture?.index))
  if (!bytes) {
    // No texture and a base alpha of 1: nothing can be transparent.
    material.alphaMode = 'OPAQUE'
    changed += 1
    console.log(`${name.padEnd(24)}  ${'—'.padStart(12)}  ${'—'.padStart(7)}   ${mode.padEnd(6)}  OPAQUE (no texture)`)
    continue
  }

  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { transparent, edge, interiorDeep, largestBlob, total } = alphaTopology(
    data,
    info.width,
    info.height,
  )
  const reallyTranslucent = largestBlob >= MIN_TRANSLUCENT_BLOB

  let next
  if (transparent === 0 && !reallyTranslucent) next = 'OPAQUE'
  else if (!reallyTranslucent) next = 'MASK'
  else next = 'BLEND'

  if (next !== mode) {
    material.alphaMode = next
    if (next === 'MASK') material.alphaCutoff = 0.5
    else delete material.alphaCutoff
    changed += 1
  }

  console.log(
    `${name.padEnd(24)}  ${((transparent / total) * 100).toFixed(2).padStart(12)}  ${((edge / total) * 100).toFixed(3).padStart(6)}  ${String(interiorDeep).padStart(9)}  ${String(largestBlob).padStart(11)}   ${mode.padEnd(6)}  ${next}${next === mode ? ' (unchanged)' : ''}`,
  )
}

if (changed === 0) {
  console.log('\nNothing to change.')
} else if (DRY_RUN) {
  console.log(`\n${changed} material(s) would change. Nothing written (--dry-run).`)
} else {
  writeGlb(TARGET, json, bin)
  console.log(`\n${changed} material(s) corrected, file rewritten.`)
}
