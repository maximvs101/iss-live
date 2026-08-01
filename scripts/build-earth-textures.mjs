/**
 * Prepares the three images the planet is painted with, from NASA's originals.
 *
 * A build step rather than three files committed as-is, because one of the three is *derived* and a
 * derived binary with no recipe is a mystery. The roughness map decides where the Sun glints, and
 * it is computed here from the colour image by a rule that can be read, argued with and re-run.
 *
 * Two of them come straight from NASA, downloaded once and cached beside the repository:
 *
 *   Blue Marble Next Generation, December 2004 — land, sea and ice, with no lighting baked in.
 *   That last part is why it works here: the scene has its own Sun, and a texture carrying someone
 *   else's would fight it. Same reason Black Marble suits the night side.
 *
 *   The BMNG cloud composite — a cloud field, not today's weather. See the note in Clouds.
 *
 * The third is built:
 *
 *   Roughness. Blue Marble is a photograph, so it says where the water is if you ask it properly.
 *   Water is *blue and dark*; land is brown, green or grey; ice and snow are blue-ish but bright.
 *   Neither test alone works — blueness alone calls Greenland a lake, darkness alone calls the
 *   Amazon one — so the mask is the product of the two, softened at both ends so coastlines do not
 *   alias into a staircase of glinting pixels.
 *
 * Usage: npm run build:earth
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cache = resolve(root, 'node_modules/.cache/earth-textures')
const out = resolve(root, 'public/textures')

const SOURCES = {
  day: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
  clouds: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg',
}

/** Roughness either side of the shoreline. The sea's value is derived in scene/oceanGlint. */
const SEA_ROUGHNESS = 0.528
const LAND_ROUGHNESS = 0.92

/**
 * The two tests, and where each fades.
 *
 * Sampled from the source at places whose surface is not in doubt:
 *
 *   deep Pacific   rgb(6, 14, 37)     blueness  31   luminance  19
 *   north Atlantic rgb(3, 6, 23)      blueness  20   luminance  11
 *   Bahamas shelf  rgb(25, 114, 130)  blueness 105   luminance  90
 *   Siberian snow  rgb(202, 209, 215) blueness  13   luminance 209
 *   Greenland      rgb(249, 253, 255) blueness   6   luminance 252
 *   Sahara         rgb(154, 120, 75)  blueness −79   luminance 116
 *   Amazon         rgb(89, 96, 62)    blueness −27   luminance  82
 *
 * The blueness test is set low and the brightness test carries the snow. Set high enough to reject
 * Siberia on blueness alone, it also half-rejects the north Atlantic, whose water is only 20 bluer
 * than it is red — the gap between darkest ocean and brightest snow is barely seven counts wide, so
 * one test cannot straddle it. Between them they separate cleanly, and the coverage figure at the
 * end of this script is what says so: the planet's oceans are 71 % of it.
 */
const BLUENESS_FADE = [2, 14]
const BRIGHTNESS_FADE = [200, 120]

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** How much of a pixel is open water, from 0 to 1. */
function waterFraction(r, g, b) {
  const blueness = smoothstep(BLUENESS_FADE[0], BLUENESS_FADE[1], b - r)
  const darkness = smoothstep(BRIGHTNESS_FADE[0], BRIGHTNESS_FADE[1], (r + g + b) / 3)
  return blueness * darkness
}

async function fetchOnce(name, url) {
  mkdirSync(cache, { recursive: true })
  const path = resolve(cache, `${name}.jpg`)
  if (existsSync(path)) {
    console.log(`  cached  ${name}  ${(statSync(path).size / 1024 / 1024).toFixed(2)} MB`)
    return path
  }
  console.log(`  fetching ${name} …`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  await writeFile(path, Buffer.from(await response.arrayBuffer()))
  console.log(`  fetched ${name}  ${(statSync(path).size / 1024 / 1024).toFixed(2)} MB`)
  return path
}

console.log('Earth textures\n')
mkdirSync(out, { recursive: true })

const dayPath = await fetchOnce('day', SOURCES.day)
const cloudPath = await fetchOnce('clouds', SOURCES.clouds)

// --- colour ------------------------------------------------------------------------------------
// Kept at the source resolution: 5,400 across is 7.4 km a pixel, and the ground the station can see
// at once is 2,290 km, so about 310 pixels of it. Re-encoded because the original is generous.
await sharp(dayPath).jpeg({ quality: 82, mozjpeg: true }).toFile(resolve(out, 'earth-day.jpg'))

// --- roughness ---------------------------------------------------------------------------------
// Half the colour resolution: this decides *whether* a pixel glints, not what it looks like, and a
// shoreline soft by a few kilometres is invisible against a glint patch hundreds of kilometres wide.
const ROUGHNESS_WIDTH = 2700
const source = sharp(dayPath).resize(ROUGHNESS_WIDTH, ROUGHNESS_WIDTH / 2)
const { data, info } = await source.raw().toBuffer({ resolveWithObject: true })
const mask = Buffer.alloc(info.width * info.height)
let water = 0
for (let i = 0, p = 0; p < mask.length; i += info.channels, p += 1) {
  const fraction = waterFraction(data[i], data[i + 1], data[i + 2])
  water += fraction
  // three.js reads roughness from the green channel and multiplies by material.roughness, which is
  // left at 1, so the value here *is* the roughness.
  mask[p] = Math.round(255 * (LAND_ROUGHNESS + (SEA_ROUGHNESS - LAND_ROUGHNESS) * fraction))
}
await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
  .jpeg({ quality: 85, mozjpeg: true })
  .toFile(resolve(out, 'earth-roughness.jpg'))

// --- clouds ------------------------------------------------------------------------------------
await sharp(cloudPath).jpeg({ quality: 82, mozjpeg: true }).toFile(resolve(out, 'earth-clouds.jpg'))

console.log('\nWritten:')
for (const name of ['earth-day.jpg', 'earth-roughness.jpg', 'earth-clouds.jpg', 'earth-night.jpg']) {
  const path = resolve(out, name)
  if (!existsSync(path)) continue
  const { width, height } = await sharp(path).metadata()
  console.log(`  ${name.padEnd(22)} ${String(width).padStart(5)}×${height}  ${(statSync(path).size / 1024).toFixed(0)} kB`)
}

console.log(`\nWater covers ${((water / mask.length) * 100).toFixed(1)} % of the mask (the planet is 71 %).`)

// The mask is only useful if it agrees with a map, so it is asked about places that are not in
// dispute. A rule that got these wrong would still produce a plausible-looking image.
// Read back with the channel count sharp actually returns rather than the one that was written. A
// greyscale JPEG can decode to three, and assuming one scrambles the position by a factor of three
// — which reads as a broken rule rather than a broken index, since every value is still a plausible
// roughness. It put the Amazon at sea and the Indian Ocean on land before this line existed.
const check = sharp(resolve(out, 'earth-roughness.jpg'))
const { data: built, info: builtInfo } = await check.raw().toBuffer({ resolveWithObject: true })
const roughnessAt = (lat, lon) => {
  const w = builtInfo.width
  const x = ((Math.round((lon / 360 + 0.5) * w) % w) + w) % w
  const y = Math.max(0, Math.min(builtInfo.height - 1, Math.round((1 - (lat / 180 + 0.5)) * builtInfo.height)))
  return built[(y * w + x) * builtInfo.channels] / 255
}

const expected = [
  ['deep Pacific', 0, -150, 'sea'],
  ['north Atlantic', 40, -40, 'sea'],
  ['Indian Ocean', -20, 80, 'sea'],
  ['Sahara', 23, 15, 'land'],
  ['Amazon', -3, -60, 'land'],
  ['Australia', -25, 133, 'land'],
  ['Greenland', 72, -40, 'land'],
  ['Antarctica', -80, 0, 'land'],
  ['Congo basin', 0, 22, 'land'],
  ['Himalaya', 28, 86, 'land'],
  ['Siberian snow', 65, 100, 'land'],
  ['Southern Ocean', -55, 20, 'sea'],
]

console.log('\n  place                roughness   expected')
let wrong = 0
for (const [name, lat, lon, kind] of expected) {
  const value = roughnessAt(lat, lon)
  const midpoint = (SEA_ROUGHNESS + LAND_ROUGHNESS) / 2
  const reads = value < midpoint ? 'sea' : 'land'
  const ok = reads === kind
  if (!ok) wrong += 1
  console.log(`  ${name.padEnd(20)} ${value.toFixed(3)}      ${kind}${ok ? '' : `  ← reads as ${reads}`}`)
}

if (wrong) {
  console.log(`\n${wrong} of ${expected.length} places came out on the wrong side of the shoreline.`)
  process.exit(1)
}
console.log('\nEvery place tested is on the right side of the shoreline.')
