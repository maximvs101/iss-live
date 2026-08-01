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

/**
 * Which size to fetch, and which to ship.
 *
 * NASA publishes each month at 5400 × 2700 and at 21600 × 10800. The first is what this used to
 * take, and it is too coarse for the view this scene actually shows: 7.41 km per texel against
 * about **one kilometre per screen pixel**, so the map is magnified seven to nine times and reads
 * as an image that has not finished loading.
 *
 * The ceiling is not the file size, it is the GPU. 21600 is past `maxTextureSize` on most hardware
 * and would want 1.19 GB of texture memory. 10800 lands at 3.71 km per texel and 297 MB, and
 * measures — acutance over the ground, which is blind to exposure — at **3.028 against 2.075**, a
 * 46 % gain. 8192 was the middle option and gives 2.656.
 */
const DAY_SOURCE_WIDTH = 21600
const DAY_WIDTH = 10800

const dayUrl = (month) =>
  `https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/${DAY_RECORDS[month]}` +
  `/world.topo.bathy.2004${month}.3x${DAY_SOURCE_WIDTH}x${DAY_SOURCE_WIDTH / 2}.jpg`

/**
 * The clouds, in two hemispheres.
 *
 * The obvious file is `cloud_combined_2048.jpg`, which is what this used to take, and it is a trap:
 * at 19.55 km per texel it was the coarsest thing in the scene by a factor of three, and
 * downsampling by ten from the real product had smoothed a structured sky into a uniform veil.
 * That veil is what made an earlier version of this file claim the data was a monthly *mean* with
 * no edges. It is not. `2001210` is a date — 29 July 2001 — and at full size the field is plainly
 * synoptic: cyclones, frontal bands, the ITCZ, cellular convection over the oceans.
 *
 * Two tiles of 21600 × 21600, a hemisphere each, 202 MB apiece. Which is which was settled by
 * correlating every arrangement against the published small map rather than by reading the names:
 * west then east scores 0.50, and the five alternatives — the other order, and either with a flip
 * — score between −0.12 and −0.05.
 */
const CLOUD_TILES = {
  west: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud.W.2001210.21600x21600.png',
  east: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud.E.2001210.21600x21600.png',
}

/**
 * Width of the finished cloud map.
 *
 * Smaller than the day map's 10800 on purpose. Texture memory is the binding constraint — the day
 * map alone wants 297 MB — and clouds are soft-edged by nature, so the last doubling buys less here
 * than it does on coastlines and terrain. 5400 is 7.41 km per texel, 2.6 times finer than the file
 * it replaces, for 74 MB.
 */
const CLOUD_WIDTH = 5400

/**
 * Columns over which the two hemispheres are cross-faded into each other.
 *
 * The join is not clean, and the discontinuity is NASA's rather than this script's: the halves are
 * composited from different passes, so at 0° and at 180° the cloud field genuinely does not line
 * up. A feather cannot invent the missing agreement; it spreads the step over about a degree of
 * longitude, which is under what the eye picks out as an edge. The two numbers printed at the end
 * are the step and an ordinary neighbour's, so the claim can be checked rather than trusted.
 */
const CLOUD_SEAM_FEATHER = 16

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

async function fetchOnce(name, url, extension = 'jpg') {
  mkdirSync(cache, { recursive: true })
  const path = resolve(cache, `${name}.${extension}`)
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
 * There is none, and the reason is worth keeping because getting here took a wrong turn. Drawn from
 * the small `cloud_combined_2048` file the field was a uniform veil — area-weighted mean opacity
 * 24.5 % spread smoothly over everything — and the planet went milky. The diagnosis at the time was
 * that the data must be a monthly *mean*, and that a mean has no edges, so the values went through
 * a 1.5 power curve to push the thin half towards clear.
 *
 * The diagnosis was wrong. The data is one day, 29 July 2001, and the smoothness was an artefact of
 * downsampling it by ten. At full resolution the edges are there and the curve is a solution to a
 * problem that no longer exists, so it is 1.0: the field as published. Kept as a constant rather
 * than deleted, because the next person to look at a milky planet should find this note before
 * reaching for the same lever.
 */
const CLOUD_GAMMA = 1.0

/** Half the colour resolution: this decides *whether* a pixel glints, not what it looks like. */
const ROUGHNESS_WIDTH = 2700

async function buildClouds() {
  const width = CLOUD_WIDTH
  const height = CLOUD_WIDTH / 2
  const half = width / 2

  // Each tile is 180° by 180°, so a hemisphere becomes a square half of the finished map.
  const hemisphere = async (name, url) => {
    const path = await fetchOnce(name, url, 'png')
    const { data, info } = await sharp(path, { limitInputPixels: false, sequentialRead: true })
      .resize(half, height, { kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    // Read back with the channel count sharp actually returns. A greyscale source can come back as
    // three, and assuming one scrambles every index by a factor of three — which showed up here as
    // neighbouring pixels differing by exactly zero, because it was comparing red against green.
    const plane = new Uint8Array(half * height)
    for (let p = 0; p < plane.length; p += 1) plane[p] = data[p * info.channels]
    return plane
  }

  const west = await hemisphere('cloud-W', CLOUD_TILES.west)
  const east = await hemisphere('cloud-E', CLOUD_TILES.east)

  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v += 1) lut[v] = Math.round(255 * (v / 255) ** CLOUD_GAMMA)

  const mask = Buffer.alloc(width * height)
  let weighted = 0
  let weight = 0
  let seamStep = 0
  let ordinaryStep = 0

  for (let y = 0; y < height; y += 1) {
    // Area weight: an equirectangular map gives the poles as much room as the equator.
    const w = Math.cos((0.5 - (y + 0.5) / height) * Math.PI)
    seamStep += Math.abs(west[y * half + half - 1] - east[y * half])
    ordinaryStep += Math.abs(west[y * half + 1000] - west[y * half + 1001])

    for (let x = 0; x < width; x += 1) {
      const inWest = x < half
      let value = inWest ? west[y * half + x] : east[y * half + (x - half)]

      // Feather both joins: the one down the middle at 0°, and the one at the wrap at ±180°.
      const acrossCentre = inWest ? half - 1 - x : x - half
      const acrossWrap = inWest ? x : width - 1 - x
      const facing = inWest ? east[y * half] : west[y * half + half - 1]
      const behind = inWest ? east[y * half + half - 1] : west[y * half]

      if (acrossCentre < CLOUD_SEAM_FEATHER) {
        const t = (CLOUD_SEAM_FEATHER - acrossCentre) / (2 * CLOUD_SEAM_FEATHER)
        value = Math.round(value * (1 - t) + facing * t)
      } else if (acrossWrap < CLOUD_SEAM_FEATHER) {
        const t = (CLOUD_SEAM_FEATHER - acrossWrap) / (2 * CLOUD_SEAM_FEATHER)
        value = Math.round(value * (1 - t) + behind * t)
      }

      const curved = lut[value]
      mask[y * width + x] = curved
      weighted += (curved / 255) * w
      weight += w
    }
  }

  await sharp(mask, { raw: { width, height, channels: 1 } })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(resolve(out, 'earth-clouds.jpg'))

  console.log(
    `  clouds  ${width}×${height}, ${((2 * Math.PI * 6371) / width).toFixed(2)} km per texel,` +
      ` gamma ${CLOUD_GAMMA}, mean opacity ${((weighted / weight) * 100).toFixed(1)} % by area`,
  )
  console.log(
    `          seam step ${(seamStep / height).toFixed(1)} where an ordinary neighbour is` +
      ` ${(ordinaryStep / height).toFixed(1)} — feathered over ${CLOUD_SEAM_FEATHER} columns`,
  )
}

async function buildMonth(month) {
  const source = await fetchOnce(`day-${month}`, dayUrl(month))

  // Halved from the source, which is the largest size the GPU will hold. See DAY_WIDTH.
  await sharp(source)
    .resize(DAY_WIDTH, DAY_WIDTH / 2, { kernel: 'lanczos3' })
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

await buildClouds()

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
