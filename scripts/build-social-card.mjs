/**
 * Draws the card a link to the site unfurls into.
 *
 * Shared on X, Bluesky, Discord, LinkedIn or Slack, a bare URL is a line of text; with an
 * `og:image` it is a picture, and the picture is most of what gets clicked. The card is drawn here
 * rather than screenshotted, for the reason the favicon is: a screenshot carries whatever the
 * station happened to be doing when someone ran it, and a card is not a reading — it must not
 * claim a position, a time or a value. What it shows is the map the site is known by, the
 * console palette, one orbit, and the name.
 *
 * The coastlines are the same Natural Earth 1:110m outlines the map draws, projected the same
 * way. The track is a 51.6° sinusoid — the station's inclination — with no date attached.
 *
 * 1200 × 630 is the size every platform's card renderer agrees on: Open Graph's recommendation,
 * X's `summary_large_image`, LinkedIn's minimum. Rendered with sharp from an SVG, like the icons.
 */
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const { feature } = require('topojson-client')
const topology = require('world-atlas/land-110m.json')

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../public/social-card.png')

const W = 1200
const H = 630
/** The map's box: full width, 2:1, so 600 tall — the card's 630 leave 15 px above and below. */
const MAP = { x: 0, y: 15, w: 1200, h: 600 }

const project = (lon, lat) => [MAP.x + ((lon + 180) / 360) * MAP.w, MAP.y + ((90 - lat) / 180) * MAP.h]

// --- Coastlines, from the same dataset the map uses -----------------------------------------

const collection = feature(topology, topology.objects.land)
const features = collection.type === 'FeatureCollection' ? collection.features : [collection]
const rings = features.flatMap((f) =>
  f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates,
)
const land = rings
  .map((ring) => {
    const points = ring.map(([lon, lat]) => project(lon, lat))
    // A point under two pixels from the previous one draws nothing at this size.
    const kept = points.filter(
      (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1.5,
    )
    if (kept.length < 4) return ''
    /*
     * Lifted pen across the antimeridian.
     *
     * A ring that crosses longitude 180 — Antarctica, and the islands on the date line near the
     * equator — projects to two points a whole map apart, and a straight line between them is a
     * streak across the world in coastline colour. The first render had one along the equator.
     * The map in the application splits these rings properly; here a new subpath at the jump is
     * enough, since the fill is dark and the streak was the only thing the eye caught.
     */
    let d = ''
    for (let i = 0; i < kept.length; i += 1) {
      const [x, y] = kept[i]
      const jump = i > 0 && Math.abs(x - kept[i - 1][0]) > MAP.w / 2
      d += `${i === 0 || jump ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    }
    return d + 'Z'
  })
  .join('')

// --- One orbit, as a ground track -----------------------------------------------------------

const INCLINATION = 51.6
const amplitude = (INCLINATION / 90) * (MAP.h / 2)
const track = (from, to, phase) => {
  const pts = []
  for (let x = from; x <= to; x += 6) {
    const y = MAP.y + MAP.h / 2 + amplitude * Math.sin((2 * Math.PI * (x - phase)) / MAP.w)
    pts.push(`${x} ${y.toFixed(1)}`)
  }
  return `M${pts.join('L')}`
}
// The station sits a third of the way across, over the Atlantic, heading north-east.
const [sx, sy] = [430, MAP.y + MAP.h / 2 + amplitude * Math.sin((2 * Math.PI * (430 - 250)) / MAP.w)]

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05080c" stop-opacity="0.96"/>
      <stop offset="0.55" stop-color="#05080c" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#05080c" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#05080c"/>
  <rect x="${MAP.x}" y="${MAP.y}" width="${MAP.w}" height="${MAP.h}" fill="#0a1622"/>

  <g stroke="#16222e" stroke-width="1">
    ${[-60, -30, 0, 30, 60].map((lat) => `<line x1="0" y1="${project(0, lat)[1]}" x2="${W}" y2="${project(0, lat)[1]}"/>`).join('')}
    ${[-120, -60, 0, 60, 120].map((lon) => `<line x1="${project(lon, 0)[0]}" y1="${MAP.y}" x2="${project(lon, 0)[0]}" y2="${MAP.y + MAP.h}"/>`).join('')}
  </g>

  <path d="${land}" fill="#111e28" stroke="#31536b" stroke-width="1" stroke-linejoin="round"/>

  <path d="M0 ${MAP.y} L190 ${MAP.y} C 250 ${MAP.y + 150}, 250 ${MAP.y + 450}, 190 ${MAP.y + MAP.h} L0 ${MAP.y + MAP.h} Z" fill="#000" opacity="0.45"/>
  <path d="M${W} ${MAP.y} L1010 ${MAP.y} C 950 ${MAP.y + 150}, 950 ${MAP.y + 450}, 1010 ${MAP.y + MAP.h} L${W} ${MAP.y + MAP.h} Z" fill="#000" opacity="0.45"/>

  <path d="${track(0, 430, 250)}" fill="none" stroke="#4a5c70" stroke-width="2" stroke-dasharray="5 6" opacity="0.7"/>
  <path d="${track(430, W, 250)}" fill="none" stroke="#4ade80" stroke-width="3"/>

  <circle cx="${sx}" cy="${sy.toFixed(1)}" r="70" fill="rgba(74,222,128,0.06)" stroke="#4ade80" stroke-width="1" stroke-opacity="0.5"/>
  <g transform="translate(${sx} ${sy.toFixed(1)})">
    <rect x="-16" y="-3" width="32" height="6" fill="#9aa6b4"/>
    <rect x="-11" y="-14" width="6" height="28" fill="#5b7a99"/>
    <rect x="5" y="-14" width="6" height="28" fill="#5b7a99"/>
  </g>

  <rect width="${W}" height="330" fill="url(#veil)"/>

  <g font-family="Consolas, 'Cascadia Mono', 'DejaVu Sans Mono', 'Courier New', monospace">
    <text x="60" y="118" font-size="72" font-weight="700" letter-spacing="8" fill="#e6edf5">ISS LIVE</text>
    <text x="60" y="172" font-size="27" fill="#9fb0c3">Live telemetry, orbital position and a 3D twin of the station,</text>
    <text x="60" y="210" font-size="27" fill="#9fb0c3">from NASA's public broadcast. Nothing invented, ages stated.</text>
    <text x="60" y="590" font-size="22" letter-spacing="2" fill="#8698b0">iss-live.pages.dev</text>
  </g>
</svg>`

/*
 * Rasterised at the size the SVG declares — and then checked, because the first version was not.
 *
 * `density: 96` against sharp's 72 dpi baseline scaled the 1200 × 630 drawing to 1600 × 840, and
 * the log line printed the constants rather than the file, so the card shipped at the wrong size
 * under tags declaring the right one. The density is left at the default and the dimensions are
 * read back from the output.
 */
await sharp(Buffer.from(svg)).resize(W, H).png({ compressionLevel: 9 }).toFile(out)

const { width, height } = await sharp(out).metadata()
if (width !== W || height !== H) {
  console.error(`
The card came out ${width}x${height}, not ${W}x${H}.`)
  process.exit(1)
}

// The same leap-of-faith guard the icons have: an SVG whose text fell back to nothing would
// rasterise a map with no title, and nothing downstream would notice.
const bytes = (await readFile(out)).length
const stats = await sharp(out).extract({ left: 60, top: 60, width: 420, height: 70 }).stats()
const titleSpread = Math.max(...stats.channels.map((c) => c.max - c.min))
console.log(`social-card.png  ${width}x${height}  ${(bytes / 1024).toFixed(1)} kB  title-area contrast spread ${titleSpread}`)
if (titleSpread < 120) {
  console.error('\nThe title area is nearly uniform — the text did not render. Check the fonts sharp can see.')
  process.exit(1)
}
