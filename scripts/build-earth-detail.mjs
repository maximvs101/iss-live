/**
 * Cuts the close-up tiles from NASA's 500 m imagery.
 *
 * The global map is 3.71 km per texel and the scene shows about a kilometre per screen pixel, so it
 * is magnified nearly four times. No global texture can fix that — 40 000 across would be needed and
 * the GPU stops at 16 384 — but the station only ever sees 1.3 % of the planet at once, so the fix
 * is to carry a sharp patch of *that* rather than a sharp everything.
 *
 * **The tiles hold a ratio, not a picture, and only its luminance.** Each pixel is the brightness of
 * the 500 m imagery divided by the brightness of the same place in the global map, so the shader
 * multiplies rather than replaces. Colour is left out because a detail layer's chroma buys almost
 * nothing at a kilometre and costs two thirds of the file: measured on the Himalaya, 1903 kB in
 * colour against 682 in luminance for a picture that is indistinguishable. The colour, the season and
 * the snow line keep coming from the twelve monthly maps and the tile only puts back the detail they
 * are too coarse to hold. One set therefore serves every month: the alternative was twelve sets cut
 * from 5.4 GB of source, and a January coastline wearing August's colour.
 *
 * The source is eight pieces of 21600 × 21600, each 90° of longitude by 90° of latitude, which is
 * why the grid is 18° — see earthDetail, where 90 % 18 === 0 is asserted rather than remembered.
 *
 * Usage: npm run build:detail
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'
import {
  TILE_DEGREES,
  TILE_PIXELS,
  allTiles,
  tileBounds,
  tileName,
} from '../src/scene/earthDetail.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cache = resolve(root, 'node_modules/.cache/earth-textures')
const out = resolve(root, 'public/textures')

const SOURCE_BASE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73776'

/** Pixels per degree in the source: 21600 across 90°. */
const SOURCE_PER_DEGREE = 240

/** The month the tiles were cut from, and so the map the ratio is taken against. */
const BASE_MONTH = '08'

/**
 * How far the ratio may run before it is clipped.
 *
 * Stored as `value / 255 * 4`, so the range is 0 to 4 and unity sits at 64. Four rather than two
 * because the ratio is taken in **linear** light: the shader multiplies `diffuseColor`, which three
 * has already decoded out of sRGB, and a ratio computed on the encoded bytes would be applied in the
 * wrong space. Undoing the encoding steepens it — a factor of two in sRGB is 4.6 in linear — so the
 * range has to be wide enough not to clip a coastline.
 */
const RATIO_RANGE = 4

/** sRGB to linear, so the ratio is one the shader can multiply straight into `diffuseColor`. */
const linear = (byte) => {
  const v = byte / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/**
 * Below this the division is meaningless.
 *
 * Deep ocean in shadow comes off the map at two or three counts, and dividing by it turns
 * photographic noise into a bright speckle. Where the map is that dark there is nothing to sharpen,
 * so the ratio is pinned at unity.
 */
const FLOOR = 12

/**
 * Tiles flatter than this add nothing and are not written.
 *
 * Open ocean has no structure in Blue Marble beyond a smooth bathymetric gradient, so its ratio is
 * unity everywhere. Measured as the RMS departure from unity in ratio units: deep ocean comes out at
 * 0.075 and the Himalaya at 0.345, so 0.09 separates them with room on both sides. The scene falls
 * back to the global map wherever a tile is missing, which over water is the correct picture rather
 * than a degraded one.
 */
const FLATNESS = 0.09

const sourceName = (west, south) =>
  `bm500-${'ABCD'[Math.floor((west + 180) / 90)]}${south >= 0 ? 1 : 2}`

/** Where a tile's box sits inside its 21600 × 21600 source piece. */
function extractBox(bounds) {
  const { west, south } = bounds
  const north = south + TILE_DEGREES
  const pieceWest = -180 + Math.floor((west + 180) / 90) * 90
  // Each piece runs downwards from its own top edge: 90° N for the northern row, the equator for
  // the southern one. Getting this the wrong way up would mirror every tile north to south and
  // still look like terrain, which is why it is derived rather than guessed.
  const pieceTop = south >= 0 ? 90 : 0
  return {
    left: Math.round((west - pieceWest) * SOURCE_PER_DEGREE),
    top: Math.round((pieceTop - north) * SOURCE_PER_DEGREE),
    width: TILE_DEGREES * SOURCE_PER_DEGREE,
    height: TILE_DEGREES * SOURCE_PER_DEGREE,
  }
}

console.log('Earth detail tiles\n')
mkdirSync(out, { recursive: true })

const globalMap = resolve(out, `earth-day-${BASE_MONTH}.jpg`)
if (!existsSync(globalMap)) throw new Error(`run build:earth first — ${globalMap} is missing`)

/**
 * Fetch a source piece, and check that all of it arrived.
 *
 * The length check is the point. The first run of this took eight pieces over a slow link, saw HTTP
 * 200 on every one, and stopped there — two of them were half-transferred, and the failure surfaced
 * eleven tiles into the cut as `premature end of JPEG image`. A status code says the server agreed
 * to send something; only the byte count says it arrived.
 */
async function fetchPiece(name) {
  mkdirSync(cache, { recursive: true })
  const path = resolve(cache, `${name}.jpg`)
  const url = `${SOURCE_BASE}/world.topo.bathy.2004${BASE_MONTH}.3x21600x21600.${name.slice(-2)}.jpg`

  const head = await fetch(url, { headers: { Range: 'bytes=0-0' } })
  const expected = Number(head.headers.get('content-range')?.split('/')[1] ?? 0)
  if (!expected) throw new Error(`${name}: the server would not say how long it is`)

  if (existsSync(path) && statSync(path).size === expected) return path
  if (existsSync(path)) {
    console.log(`  ${name} is ${statSync(path).size} of ${expected} bytes — fetching again`)
  }

  process.stdout.write(`  fetching ${name} … `)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  await writeFile(path, Buffer.from(await response.arrayBuffer()))
  const got = statSync(path).size
  if (got !== expected) throw new Error(`${name}: ${got} bytes of ${expected} — the transfer was cut short`)
  console.log(`${(got / 1024 / 1024).toFixed(1)} MB`)
  return path
}

const pieces = [...new Set(allTiles().map((id) => sourceName(tileBounds(id).west, tileBounds(id).south)))]
for (const name of pieces) await fetchPiece(name)

let written = 0
let skipped = 0
const skippedNames = []
let bytes = 0
const perRow = new Map()

for (const id of allTiles()) {
  const bounds = tileBounds(id)
  const box = extractBox(bounds)
  const piece = resolve(cache, `${sourceName(bounds.west, bounds.south)}.jpg`)

  const detail = await sharp(piece, { limitInputPixels: false, sequentialRead: true })
    .extract(box)
    .resize(TILE_PIXELS, TILE_PIXELS, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  // The same box out of the global map, blown up to match. This is what the scene already draws, so
  // dividing by it leaves exactly the part the scene is missing.
  const coarse = await sharp(globalMap)
    .extract({
      left: Math.round(((bounds.west + 180) / 360) * 10800),
      top: Math.round(((90 - bounds.north) / 180) * 5400),
      width: Math.round((TILE_DEGREES / 360) * 10800),
      height: Math.round((TILE_DEGREES / 180) * 5400),
    })
    .resize(TILE_PIXELS, TILE_PIXELS, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const ratio = Buffer.alloc(TILE_PIXELS * TILE_PIXELS)
  let sum = 0
  let sumSquares = 0
  for (let p = 0; p < TILE_PIXELS * TILE_PIXELS; p += 1) {
    const f = p * detail.info.channels
    const c = p * coarse.info.channels
    const fine =
      0.2126 * linear(detail.data[f]) + 0.7152 * linear(detail.data[f + 1]) + 0.0722 * linear(detail.data[f + 2])
    const flat =
      0.2126 * linear(coarse.data[c]) + 0.7152 * linear(coarse.data[c + 1]) + 0.0722 * linear(coarse.data[c + 2])
    const value = coarse.data[c + 1] < FLOOR ? 1 : fine / flat
    const stored = Math.max(0, Math.min(255, Math.round((value / RATIO_RANGE) * 255)))
    ratio[p] = stored
    // Measured in ratio units rather than stored bytes, so the threshold below does not move when
    // the encoding range does.
    const centred = (stored / 255) * RATIO_RANGE - 1
    sum += centred
    sumSquares += centred * centred
  }

  const count = TILE_PIXELS * TILE_PIXELS
  const variance = sumSquares / count - (sum / count) ** 2
  const spread = Math.sqrt(variance)

  if (spread < FLATNESS) {
    skipped += 1
    skippedNames.push(`${tileName(id).slice(13, 18)} (${spread.toFixed(3)})`)
    continue
  }

  const path = resolve(out, tileName(id))
  await sharp(ratio, { raw: { width: TILE_PIXELS, height: TILE_PIXELS, channels: 1 } })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(path)
  written += 1
  bytes += statSync(path).size
  perRow.set(id.row, (perRow.get(id.row) ?? 0) + 1)
  process.stdout.write(`\r  ${written} written, ${skipped} skipped (all water)   `)
}

console.log(`\n\n  ${written} tiles written, ${skipped} left to the global map because they are open water`)
console.log(`  ${(bytes / 1024 / 1024).toFixed(1)} MB in the repository; a visitor loads one at a time, about ${(bytes / written / 1024).toFixed(0)} kB`)
console.log(`  ${((TILE_DEGREES / 360) * 2 * Math.PI * 6371 / TILE_PIXELS).toFixed(3)} km per texel, against 3.71 for the global map`)
console.log('\n  by row, south to north:')
for (const row of [...perRow.keys()].sort((a, b) => a - b)) {
  const south = -72 + row * TILE_DEGREES
  console.log(`    ${String(south).padStart(4)}° to ${String(south + TILE_DEGREES).padStart(3)}°   ${perRow.get(row)} of 20`)
}
