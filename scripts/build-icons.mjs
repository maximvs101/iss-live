/**
 * Rasterises the favicon for the platforms that will not take an SVG.
 *
 * Every current browser reads `favicon.svg`, which is why that file is the source of truth and this
 * script has no artwork of its own. Apple's home screen is the exception: iOS ignores SVG icons
 * entirely and falls back to a screenshot of the page if no PNG is offered, which for a dark
 * application is an unreadable grey square.
 *
 * The icon itself is Tabler's `satellite`, MIT licensed, on the application's own panel colour with
 * its accent. The stroke is thickened from Tabler's 2 to 2.4: at 16 px a 2-unit stroke on a 32-unit
 * canvas lands on a single device pixel, and the glyph closes up.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../public/favicon.svg')

/** Apple's home screen icon. 180 is the size current iPhones ask for. */
const APPLE = 180
/** A raster fallback for anything that still refuses SVG. */
const PNG = 32

const svg = await readFile(source)

for (const [size, name] of [
  [APPLE, 'apple-touch-icon.png'],
  [PNG, 'favicon.png'],
]) {
  const out = resolve(here, '../public', name)
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
  const { size: bytes } = await sharp(out).metadata().then(async (m) => ({
    size: (await readFile(out)).length,
    ...m,
  }))
  console.log(`${name.padEnd(22)} ${size}x${size}  ${(bytes / 1024).toFixed(1)} kB`)
}

// A sanity check rather than a leap of faith: an icon that rasterised to a blank square would
// otherwise ship unnoticed, and nothing downstream looks at these files again.
const probe = await sharp(resolve(here, '../public/favicon.png')).stats()
const spread = Math.max(...probe.channels.map((c) => c.max - c.min))
if (spread < 40) {
  console.error(`\nThe rasterised icon is nearly uniform (spread ${spread}) — it is probably blank.`)
  process.exit(1)
}
console.log(`\nRasterised from ${source.split(/[\\/]/).pop()}, contrast spread ${spread}.`)
