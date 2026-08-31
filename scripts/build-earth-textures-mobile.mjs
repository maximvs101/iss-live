/**
 * A second set of the planet's images, small enough for a phone to hold in memory.
 *
 * `build:model:mobile` halved the station's textures to 256 and took 577 MB of texture memory down
 * to 37, which is what stopped iOS ending the tab. The planet was never touched, and it is the
 * larger half of the bill. Measured from the shipped files, decoded to RGBA with mipmaps:
 *
 *     earth-day-NN.jpg      10800 x 5400    297 MB
 *     earth-clouds.jpg       5400 x 2700     74 MB
 *     earth-night.jpg        3600 x 1800     33 MB
 *     earth-roughness-NN     2700 x 1350     19 MB
 *     one detail tile         2048 x 2048     21 MB
 *     ----------------------------------------------
 *                                           444 MB
 *
 * So a phone that had been brought down to about 200 MB of station was still asked for 444 MB of
 * planet, and `deviceBudget` said nothing about it: it switches the model and only the model. That
 * is the asymmetry this script closes.
 *
 * Halving the three largest — 297 + 74 + 33 becomes 74 + 19 + 8 — saves **303 MB**, which is more
 * than the whole station reduction saved. The roughness map is left alone deliberately: it is 19 MB
 * against twelve more files in the repository, and it is the one image whose value is read rather
 * than looked at, so blurring it moves coastlines in the glint. The detail tile is left alone too;
 * it is 21 MB, it is fetched only where the station happens to be, and its whole purpose is to be
 * sharper than the map underneath.
 *
 * Derived from `public/textures/`, not from NASA's originals, for the same reason the mobile model
 * is derived from the desktop one: everything needed is already in the repository, and a build that
 * needs the network is a build that stops working. Downscaling a JPEG that was itself downscaled
 * from 21600 costs a little sharpness against re-deriving from the source, and at half the width of
 * a map already three times coarser than the screen, nothing that is visible.
 *
 * Usage: npm run build:earth:mobile
 */
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const textures = resolve(root, 'public/textures')

/** The suffix the application appends when `deviceBudget` says this is a phone. */
export const LIGHT_SUFFIX = '-light'

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

/**
 * What to halve, and at what quality.
 *
 * Each entry names an image that is *looked at* rather than read as data, which is what makes a
 * lossy halving safe. Quality follows the file it comes from: the day map was written at 82, the
 * clouds at 84, and there is no reason for a smaller copy to be encoded harder than its source.
 */
const REDUCED = [
  ...MONTHS.map((month) => ({ name: `earth-day-${month}.jpg`, quality: 82 })),
  { name: 'earth-clouds.jpg', quality: 84 },
  { name: 'earth-night.jpg', quality: 84 },
]

const lightName = (name) => name.replace(/\.jpg$/, `${LIGHT_SUFFIX}.jpg`)

/** Decoded size in memory, mipmaps included — the number this whole script exists to move. */
const decodedMB = (width, height) => (width * height * 4 * (4 / 3)) / 1024 / 1024

async function reduce({ name, quality }) {
  const source = resolve(textures, name)
  if (!existsSync(source)) {
    console.error(`  [FAIL] ${name} is missing — run npm run build:earth first`)
    return null
  }

  const { width, height } = await sharp(source).metadata()
  if (width % 2 !== 0 || height % 2 !== 0) {
    console.error(`  [FAIL] ${name} is ${width}x${height}, which does not halve cleanly`)
    return null
  }

  const target = resolve(textures, lightName(name))
  await sharp(source)
    .resize(width / 2, height / 2, { kernel: 'lanczos3' })
    .jpeg({ quality, mozjpeg: true })
    .toFile(target)

  const before = statSync(source).size
  const after = statSync(target).size
  console.log(
    `  ${lightName(name).padEnd(26)} ${width / 2}x${height / 2}` +
      `  ${(after / 1e6).toFixed(2)} MB against ${(before / 1e6).toFixed(2)}` +
      `  ${decodedMB(width / 2, height / 2).toFixed(0)} MB decoded against ${decodedMB(width, height).toFixed(0)}`,
  )
  return { saved: decodedMB(width, height) - decodedMB(width / 2, height / 2), name }
}

console.log('Halving the planet for the phone build.\n')

let saved = 0
let failed = 0
for (const entry of REDUCED) {
  const result = await reduce(entry)
  if (!result) failed += 1
  // One month is what a visitor loads, so the twelve day maps are one saving and not twelve.
  else if (!result.name.startsWith('earth-day-') || result.name === 'earth-day-01.jpg') {
    saved += result.saved
  }
}

if (failed > 0) {
  console.error(`\n${failed} image(s) could not be reduced.`)
  process.exit(1)
}

console.log(`\n${saved.toFixed(0)} MB of texture memory saved on the light path, per visitor.`)
