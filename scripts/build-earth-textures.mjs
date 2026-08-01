/**
 * Prepares the images the planet is painted with, from NASA's originals.
 *
 * A build step rather than files committed as-is, because some of them are *derived* and a derived
 * binary with no recipe is a mystery. The roughness map decides where the Sun glints, and it is
 * computed here from the colour image by a rule that can be read, argued with and re-run.
 *
 * **Twelve months, not one.** The first version of this took Blue Marble's December composite,
 * which is a defensible choice for a still image and an indefensible one for a live app: it puts
 * snow across two thirds of the northern hemisphere's land in August. It was noticed the honest way
 * — the planet looked like the Moon — and it measures as plainly as it looks:
 *
 *                                   December        August
 *     land north of 39° N in snow      65.7 %        12.8 %
 *     Manitoba                    (117,122,120)   (26,38,11)
 *     saturation there                   0.10          0.70
 *
 * Seven times the saturation, from the same place on the same planet. So all twelve are built and
 * the scene loads the one for the month it is. The repository carries about 19 MB of them; a
 * visitor still downloads one, the same 1.4 MB as before.
 *
 * From NASA, downloaded once and cached beside the repository:
 *
 *   Blue Marble Next Generation, monthly — land, sea and ice, with no lighting baked in. That last
 *   part is why it works here: the scene has its own Sun, and a texture carrying someone else's
 *   would fight it. Same reason Black Marble suits the night side.
 *
 *   The BMNG cloud composite — one image, and a cloud *field* rather than today's weather. There is
 *   no monthly version of it, which is worth knowing rather than assuming.
 *
 * Built here, one per month:
 *
 *   Roughness. Blue Marble is a photograph, so it says where the water is if you ask it properly.
 *   Water is *blue and dark*; land is brown, green or grey; ice and snow are blue-ish but bright.
 *   Neither test alone works — blueness alone calls Greenland a lake, darkness alone calls the
 *   Amazon one — so the mask is the product of the two, softened at both ends so coastlines do not
 *   alias into a staircase of glinting pixels. Per month because the sea ice is: the Arctic that
 *   glints in September is solid in March, and one mask cannot say both.
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

/**
 * NASA's record number for each month's 5400 × 2700 composite.
 *
 * Written out rather than computed. They step by 25 for most of the year and then do not — April to
 * May is 46 and October to November is 58 — so a formula would silently fetch the wrong month, or
 * nothing, and only one of those is noisy.
 */
const DAY_RECORDS = {
  '01': 73580, '02': 73605, '03': 73630, '04': 73655,
  '05': 73701, '06': 73726, '07': 73751, '08': 73776,
  '09': 73801, '10': 73826, '11': 73884, '12': 73909,
}

const dayUrl = (month) =>
  `https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/${DAY_RECORDS[month]}` +
  `/world.topo.bathy.2004${month}.3x5400x2700.jpg`

const CLOUDS_URL =
  'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg'

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
 * one test cannot straddle it. Between them they separate cleanly.
 */
const BLUENESS_FADE = [2, 14]
const BRIGHTNESS_FADE = [200, 120]

/**
 * How much of the mask may read as open water, before and after the ice.
 *
 * The oceans are 71 % of the planet and sea ice covers up to about 5 % of them at the winter
 * maximum, so a month that lands outside this band is reporting something other than the sea. The
 * bound is the physical one, not a band drawn around the numbers that came out.
 */
const WATER_BAND = [62, 72]

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
  if (existsSync(path)) return path
  process.stdout.write(`  fetching ${name} … `)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  await writeFile(path, Buffer.from(await response.arrayBuffer()))
  console.log(`${(statSync(path).size / 1024 / 1024).toFixed(2)} MB`)
  return path
}

/**
 * Places whose surface is not in dispute, in every month of the year.
 *
 * A rule that got these wrong would still produce a plausible-looking image, which is the whole
 * reason for asking. Note what is *not* here: nowhere that freezes seasonally, because the right
 * answer there changes with the month and a check with two right answers checks nothing.
 */
const EXPECTED = [
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
  ['Siberia', 65, 100, 'land'],
  ['Southern Ocean', -55, 20, 'sea'],
]

/**
 * The curve put on the cloud image before it becomes an opacity map.
 *
 * The composite is a **monthly mean**, and a mean has no edges. Drawn at face value it is not a sky
 * but a veil: area-weighted, its mean opacity is 24.5 % spread smoothly over everything, so the
 * whole planet goes milky and the ground beneath stops being legible. An instantaneous sky is the
 * opposite — mostly clear or mostly covered, with edges.
 *
 * So the values are put through a power curve, which pushes the thin half towards clear and leaves
 * the thick half alone. Stated plainly because it is a presentation choice and not a measurement:
 * it trades faithfulness to the mean for the structure a real sky has. 1.5 is the gentlest curve
 * that does it — the mean falls to 16.1 %, and the share reading as clear goes from 35 % to 52 %.
 *
 * A stronger curve is not more correct, only emptier. There was no anchor available to choose by:
 * this product's mean is 24.5 % where MODIS puts global cloud fraction near 67 %, so whatever it
 * measures, it is not a fraction on that scale, and a number derived from that comparison would be
 * arithmetic laid over a guess.
 */
const CLOUD_GAMMA = 1.5

/** Half the colour resolution: this decides *whether* a pixel glints, not what it looks like. */
const ROUGHNESS_WIDTH = 2700

async function buildClouds(source) {
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true })
  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v += 1) lut[v] = Math.round(255 * (v / 255) ** CLOUD_GAMMA)

  const mask = Buffer.alloc(info.width * info.height)
  let weighted = 0
  let weight = 0
  for (let y = 0, p = 0; y < info.height; y += 1) {
    // Area weight: an equirectangular map gives the poles as much room as the equator.
    const w = Math.cos(((0.5 - (y + 0.5) / info.height) * Math.PI))
    for (let x = 0; x < info.width; x += 1, p += 1) {
      const value = lut[data[p * info.channels]]
      mask[p] = value
      weighted += (value / 255) * w
      weight += w
    }
  }

  await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(resolve(out, 'earth-clouds.jpg'))

  console.log(
    `  clouds  gamma ${CLOUD_GAMMA}, mean opacity ${((weighted / weight) * 100).toFixed(1)} %` +
      ' by area — a monthly mean, curved so it reads as sky rather than haze',
  )
}

async function buildMonth(month) {
  const source = await fetchOnce(`day-${month}`, dayUrl(month))

  // Kept at the source resolution: 5,400 across is 7.4 km a pixel, and the ground the station can
  // see at once is 2,290 km, so about 310 pixels of it. Re-encoded because the original is generous.
  await sharp(source)
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(resolve(out, `earth-day-${month}.jpg`))

  const { data, info } = await sharp(source)
    .resize(ROUGHNESS_WIDTH, ROUGHNESS_WIDTH / 2)
    .raw()
    .toBuffer({ resolveWithObject: true })

  const mask = Buffer.alloc(info.width * info.height)
  let water = 0
  for (let i = 0, p = 0; p < mask.length; i += info.channels, p += 1) {
    const fraction = waterFraction(data[i], data[i + 1], data[i + 2])
    water += fraction
    // three.js reads roughness from the green channel and multiplies by material.roughness, which
    // is left at 1, so the value here *is* the roughness.
    mask[p] = Math.round(255 * (LAND_ROUGHNESS + (SEA_ROUGHNESS - LAND_ROUGHNESS) * fraction))
  }

  const roughnessPath = resolve(out, `earth-roughness-${month}.jpg`)
  await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(roughnessPath)

  // Read back with the channel count sharp actually returns rather than the one that was written. A
  // greyscale JPEG can decode to three, and assuming one scrambles the position by a factor of
  // three — which reads as a broken rule rather than a broken index, since every value is still a
  // plausible roughness. It put the Amazon at sea and the Indian Ocean on land before this existed.
  const { data: built, info: builtInfo } = await sharp(roughnessPath)
    .raw()
    .toBuffer({ resolveWithObject: true })

  const roughnessAt = (lat, lon) => {
    const w = builtInfo.width
    const x = ((Math.round((lon / 360 + 0.5) * w) % w) + w) % w
    const y = Math.max(
      0,
      Math.min(builtInfo.height - 1, Math.round((1 - (lat / 180 + 0.5)) * builtInfo.height)),
    )
    return built[(y * w + x) * builtInfo.channels] / 255
  }

  const midpoint = (SEA_ROUGHNESS + LAND_ROUGHNESS) / 2
  const wrong = EXPECTED.filter(([, lat, lon, kind]) => {
    const reads = roughnessAt(lat, lon) < midpoint ? 'sea' : 'land'
    return reads !== kind
  })

  return {
    month,
    water: (water / mask.length) * 100,
    wrong: wrong.map(([name]) => name),
    dayKb: statSync(resolve(out, `earth-day-${month}.jpg`)).size / 1024,
    roughnessKb: statSync(roughnessPath).size / 1024,
  }
}

console.log('Earth textures\n')
mkdirSync(out, { recursive: true })

const cloudPath = await fetchOnce('clouds', CLOUDS_URL)
await buildClouds(cloudPath)

// Listed rather than taken from the record table's keys: '10', '11' and '12' are canonical integer
// strings and JavaScript hoists those ahead of '01', so the report came out starting in October.
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

const results = []
for (const month of MONTHS) results.push(await buildMonth(month))

console.log('\n  month   day      roughness   water    shoreline')
let failures = 0
for (const r of results) {
  const banded = r.water >= WATER_BAND[0] && r.water <= WATER_BAND[1]
  if (!banded || r.wrong.length > 0) failures += 1
  const note = r.wrong.length > 0 ? `← ${r.wrong.join(', ')} on the wrong side` : 'all 12 places right'
  console.log(
    `  ${r.month}    ${r.dayKb.toFixed(0).padStart(5)} kB  ${r.roughnessKb.toFixed(0).padStart(4)} kB` +
      `   ${r.water.toFixed(1).padStart(5)} %${banded ? ' ' : '←'}  ${note}`,
  )
}

const total = results.reduce((sum, r) => sum + r.dayKb + r.roughnessKb, 0)
console.log(`\n  ${(total / 1024).toFixed(1)} MB in the repository; a visitor downloads one month of it.`)
console.log(`  Water covers ${WATER_BAND[0]}–${WATER_BAND[1]} % across the year — oceans are 71 %, less the sea ice.`)

if (failures > 0) {
  console.log(`\n${failures} month(s) failed. The rule is wrong, or the wrong file was fetched.`)
  process.exit(1)
}
console.log('\nEvery month is on the right side of every shoreline.')
