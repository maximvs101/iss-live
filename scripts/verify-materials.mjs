/**
 * What the surfaces are made of, and what they cost once decoded.
 *
 * Everything else in `verify:*` checks arithmetic or structure. Nothing checked the two properties
 * that decide how the scene *looks* and whether a phone survives it, and both had drifted without a
 * word:
 *
 *   - the station is metal. 38 of 42 materials carry `metallicFactor: 1`, which on its own means
 *     nothing — it is glTF's default for "the texture decides" — so the maps are decoded here and
 *     the factor multiplied by the blue channel that actually carries metalness. The answer is
 *     0.528 mesh-weighted, and it is why the scene needs an environment map at all: a standard
 *     material computes `diffuse = baseColour × (1 − metalness)`, so ambient and fill lamps go
 *     straight past half the station.
 *   - decoded, the desktop model's textures are 604 MB against 4.2 MB of file. That ratio is the
 *     whole reason a phone build exists, and nothing was watching it.
 *
 * Six checks, and the two builds are compared against each other rather than against numbers typed
 * in here, because the mobile file is *derived* from the desktop one: what matters is that it is
 * still the same model with smaller pictures.
 *
 * Usage: npm run verify:materials
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const models = resolve(root, 'public/models')
const textures = resolve(root, 'public/textures')

/** Ceilings, set above what the files measure today with room for ordinary movement. */
const DESKTOP_TEXTURE_MB = 700
const MOBILE_TEXTURE_MB = 60
const DESKTOP_MAX_WIDTH = 1024
const MOBILE_MAX_WIDTH = 256

/**
 * The band the station's metalness has to stay in.
 *
 * Wide on purpose: this is not a target, it is a tripwire. Outside it, either the model was
 * replaced or the metallic-roughness maps were rewritten — and either way the lighting in
 * `earthEnvironment` was reasoned about a station that no longer exists.
 */
const METALNESS_BAND = [0.4, 0.7]

let failures = 0
const check = (ok, label, detail) => {
  if (!ok) failures += 1
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(52)} ${detail}`)
}

// ---------------------------------------------------------------- reading

function readGlb(path) {
  const buffer = readFileSync(path)
  const jsonLength = buffer.readUInt32LE(12)
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'))
  const bin = buffer.subarray(20 + jsonLength + 8)
  return { json, bin }
}

/** Width and height from a WebP header, without decoding the image. */
function webpSize(bytes) {
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  const kind = bytes.subarray(12, 16).toString('ascii')
  if (kind === 'VP8X') {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    }
  }
  if (kind === 'VP8L') {
    const packed = bytes.readUInt32LE(21)
    return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 }
  }
  if (kind === 'VP8 ') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
  }
  return null
}

/** RGBA with a full mip chain, which is what the driver actually holds. */
const decodedMB = (width, height) => (width * height * 4 * (4 / 3)) / 1024 / 1024

function inspect(path, { deep }) {
  const { json, bin } = readGlb(path)
  const bytesOf = (bufferView) => {
    const view = json.bufferViews[bufferView]
    const offset = view.byteOffset ?? 0
    return bin.subarray(offset, offset + view.byteLength)
  }
  const sourceOf = (index) => {
    const texture = json.textures[index]
    return texture.extensions?.EXT_texture_webp?.source ?? texture.source
  }

  const uses = new Map()
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.material === undefined) continue
      uses.set(primitive.material, (uses.get(primitive.material) ?? 0) + 1)
    }
  }

  const images = (json.images ?? []).map((image, index) => {
    const size = webpSize(bytesOf(image.bufferView)) ?? { width: 0, height: 0 }
    return { index, ...size }
  })

  const materials = []
  for (const [index, material] of (json.materials ?? []).entries()) {
    const pbr = material.pbrMetallicRoughness ?? {}
    materials.push({
      name: material.name ?? `#${index}`,
      mode: material.alphaMode ?? 'OPAQUE',
      metalFactor: pbr.metallicFactor ?? 1,
      roughFactor: pbr.roughnessFactor ?? 1,
      metalTexture: pbr.metallicRoughnessTexture
        ? sourceOf(pbr.metallicRoughnessTexture.index)
        : null,
      primitives: uses.get(index) ?? 0,
    })
  }

  return { json, images, materials, bytesOf, deep }
}

/**
 * The metalness the renderer actually shades with: the factor, times the map.
 *
 * Decoding 38 images costs about a second, which is why it is a flag rather than the default — the
 * offline suite is meant to be worth running on every change.
 */
async function effectiveMetalness(model) {
  let weighted = 0
  let primitives = 0
  for (const material of model.materials) {
    let mean = material.metalFactor
    if (material.metalTexture !== null) {
      const image = model.json.images[material.metalTexture]
      const { data, info } = await sharp(model.bytesOf(image.bufferView))
        .raw()
        .toBuffer({ resolveWithObject: true })
      let sum = 0
      const pixels = info.width * info.height
      for (let i = 0; i < pixels; i += 1) sum += data[i * info.channels + 2]
      mean = (sum / pixels / 255) * material.metalFactor
    }
    weighted += mean * material.primitives
    primitives += material.primitives
  }
  return { mean: weighted / primitives, primitives }
}

// ---------------------------------------------------------------- the checks

const deep = !process.argv.includes('--shallow')

const desktopPath = resolve(models, 'iss-igoal.glb')
const mobilePath = resolve(models, 'iss-igoal-mobile.glb')
const desktop = inspect(desktopPath, { deep })
const mobile = inspect(mobilePath, { deep })

const memoryOf = (model) => model.images.reduce((mb, i) => mb + decodedMB(i.width, i.height), 0)
const widestOf = (model) => Math.max(...model.images.map((i) => i.width))

console.log('Materials and textures, from the files themselves.\n')

console.log('1. What a device is asked to hold')
for (const [label, model, ceiling, maxWidth] of [
  ['desktop', desktop, DESKTOP_TEXTURE_MB, DESKTOP_MAX_WIDTH],
  ['mobile ', mobile, MOBILE_TEXTURE_MB, MOBILE_MAX_WIDTH],
]) {
  const mb = memoryOf(model)
  const widest = widestOf(model)
  check(
    mb <= ceiling,
    `${label} textures decode to under ${ceiling} MB`,
    `${mb.toFixed(0)} MB over ${model.images.length} images`,
  )
  check(widest <= maxWidth, `${label} images are ${maxWidth} px or smaller`, `widest ${widest} px`)
}

console.log('\n2. The mobile file is the desktop one with smaller pictures')
const byName = new Map(desktop.materials.map((m) => [m.name, m]))
const drifted = mobile.materials.filter((m) => {
  const twin = byName.get(m.name)
  return (
    !twin ||
    twin.mode !== m.mode ||
    twin.metalFactor !== m.metalFactor ||
    twin.roughFactor !== m.roughFactor ||
    twin.primitives !== m.primitives
  )
})
check(
  desktop.materials.length === mobile.materials.length,
  'both carry the same material count',
  `${desktop.materials.length} against ${mobile.materials.length}`,
)
check(
  drifted.length === 0,
  'every material agrees on mode, factors and mesh count',
  drifted.length === 0 ? 'none drifted' : drifted.map((m) => m.name).join(', '),
)

console.log('\n3. What the station is made of')
if (deep) {
  const measured = await effectiveMetalness(desktop)
  const [low, high] = METALNESS_BAND
  check(
    measured.mean >= low && measured.mean <= high,
    `mesh-weighted metalness is between ${low} and ${high}`,
    `${measured.mean.toFixed(3)} over ${measured.primitives} primitives`,
  )
  const factors = desktop.materials.filter((m) => m.metalFactor > 0.5 && m.metalTexture === null)
  check(
    factors.length === 0,
    'no material claims metal without a map to qualify it',
    factors.length === 0 ? 'none' : factors.map((m) => m.name).join(', '),
  )
} else {
  console.log('  [skip] metalness — pass without --shallow to decode the maps')
}

console.log('\n4. The planet has a copy the phone can hold')
// The names `deviceBudget.lightTexture` will ask for; a missing one is a 404 on a phone.
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const expected = [...MONTHS.map((m) => `earth-day-${m}.jpg`), 'earth-clouds.jpg', 'earth-night.jpg']
const missing = []
const notHalved = []
for (const name of expected) {
  const full = resolve(textures, name)
  const light = resolve(textures, name.replace(/\.jpg$/, '-light.jpg'))
  if (!existsSync(light)) {
    missing.push(name)
    continue
  }
  const size = (path) => {
    const bytes = readFileSync(path)
    let i = 2
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) {
        i += 1
        continue
      }
      const marker = bytes[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) }
      }
      i += 2 + bytes.readUInt16BE(i + 2)
    }
    return { width: 0, height: 0 }
  }
  if (size(light).width * 2 !== size(full).width) notHalved.push(name)
}
check(missing.length === 0, 'every light copy exists', missing.length === 0 ? `${expected.length} of ${expected.length}` : missing.join(', '))
check(notHalved.length === 0, 'and each is exactly half the width of its source', notHalved.length === 0 ? 'all halved' : notHalved.join(', '))

const planetFull = decodedMB(10800, 5400) + decodedMB(5400, 2700) + decodedMB(3600, 1800)
const planetLight = decodedMB(5400, 2700) + decodedMB(2700, 1350) + decodedMB(1800, 900)
console.log(
  `\n  the three images that have a light copy: ${planetFull.toFixed(0)} MB decoded, ${planetLight.toFixed(0)} on a phone`,
)
console.log(
  `  with the model: ${(memoryOf(desktop) + planetFull).toFixed(0)} MB on a desktop,` +
    ` ${(memoryOf(mobile) + planetLight).toFixed(0)} MB on a phone`,
)

console.log(
  failures === 0
    ? '\nThe materials are what the scene was lit for, and both builds still agree.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
