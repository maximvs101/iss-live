/**
 * Turns Natural Earth's marine areas into the smallest file that can still name a sea.
 *
 * What this replaces was a partition of the globe by longitude and latitude, written by hand. It
 * called the Black Sea and the Baltic "Indian Ocean", the Gulf of Mexico and the Caribbean "North
 * Pacific", and the Sea of Japan "Indian Ocean" — the last three being water the station crosses on
 * most orbits. Those are not approximations of the right answer, they are the wrong ocean, and no
 * amount of tuning the cuts fixes a method that has no geometry in it.
 *
 * Source: ne_110m_geography_marine_polys, the marine companion to the coastlines already used for
 * the globe, public domain. Twenty-nine areas: seven ocean basins at scalerank 0 and twenty-two
 * named seas and gulfs at scalerank 1.
 *
 * Two things are thrown away. Every property but the name and the rank, since nothing else is
 * displayed; and coordinate precision beyond two decimals, which is about a kilometre — the source
 * resolves 110 m at best and the answer sought is the name of a sea, so a kilometre of edge is
 * meaningless here and the file is a third of the size for it.
 *
 *     npm run build:marine
 */
import { writeFileSync } from 'node:fs'

/*
 * 50m rather than 110m, and the difference is not detail but vocabulary.
 *
 * The coarse set holds 29 areas and knows nothing of the Baltic, the North Sea, the Channel, the
 * Adriatic, the Java Sea or the Mozambique Channel — all of which the station crosses, and all of
 * which came back "open water". The 50m set names 118, of which 88 survive the band filter below.
 * The cost, after rounding and cropping, is 71 kB gzipped in a chunk that is not in the first load.
 */
const SCALE = process.env.SCALE ?? '50m'
const SOURCE =
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_${SCALE}_geography_marine_polys.geojson`
const OUT = new URL('../src/data/marine-areas.json', import.meta.url)

/**
 * One decimal, and consecutive duplicates dropped — rounding creates them by the thousand.
 *
 * A tenth of a degree is about 11 km at the equator, which sounds coarse until you ask what it is
 * for: naming the sea under a ground point that moves 7.6 km every second, from a source that
 * resolves 110 m at its very best and draws a coastline no navigator would use. Two decimals cost
 * 95 kB gzipped against 38 for the whole country outline set; one costs 49, and moves no answer
 * this application gives.
 */
const GRID = Number(process.env.GRID ?? 10)

function roundRing(ring) {
  const out = []
  for (const [x, y] of ring) {
    const point = [Math.round(x * GRID) / GRID, Math.round(y * GRID) / GRID]
    const last = out[out.length - 1]
    if (last && last[0] === point[0] && last[1] === point[1]) continue
    out.push(point)
  }
  // A ring has to close; rounding can open it.
  if (out.length > 2) {
    const first = out[0]
    const last = out[out.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]])
  }
  return out
}

const roundPolygon = (polygon) => polygon.map(roundRing).filter((ring) => ring.length >= 4)

/** "SOUTHERN OCEAN" and "North Atlantic Ocean" both appear; only the first needs help. */
const tidyName = (name) =>
  name === name.toUpperCase()
    ? name
        .toLowerCase()
        .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
    : name

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`${SOURCE} answered ${response.status}`)
const source = await response.json()

/**
 * Only what the station can fly over.
 *
 * The orbit is inclined 51.6°, so nothing beyond about 55° of latitude is ever underneath it, and
 * this file exists for exactly one question: what is under the station now. Dropping the areas
 * that lie wholly outside that band removes the Arctic and Antarctic seas — and with them the most
 * detailed coastline geometry in the set, which is why it is worth doing: 115 areas become 71 and
 * the file loses more than half its points.
 *
 * The consequence is stated rather than hidden: `overflightAt` is only correct within the band, and
 * both of its callers read a position that cannot leave it.
 */
const BAND = Number(process.env.BAND ?? 56)

const withinBand = (polygons) =>
  polygons.some((polygon) =>
    polygon.some((ring) => ring.some(([, latitude]) => Math.abs(latitude) <= BAND)),
  )

const areas = source.features
  .map((entry) => ({
    name: tidyName(entry.properties.name),
    // 0 is an ocean basin, 1 a named sea inside one. Kept so the lookup can prefer the specific.
    rank: entry.properties.scalerank ?? 0,
    polygons:
      entry.geometry.type === 'MultiPolygon'
        ? entry.geometry.coordinates.map(roundPolygon)
        : [roundPolygon(entry.geometry.coordinates)],
  }))
  .filter((area) => area.polygons.some((polygon) => polygon.length > 0))
  .filter((area) => withinBand(area.polygons))
  // Seas before oceans, so the first polygon that contains a point is also the most specific.
  .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))

writeFileSync(OUT, JSON.stringify(areas))

const points = areas.reduce(
  (sum, area) => sum + area.polygons.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0),
  0,
)
console.log(
  `${areas.length} marine areas, ${points.toLocaleString('en')} points, ` +
    `${(JSON.stringify(areas).length / 1024).toFixed(0)} kB -> ${OUT.pathname.split('/').pop()}`,
)
console.log(`  seas  : ${areas.filter((a) => a.rank > 0).map((a) => a.name).join(', ')}`)
console.log(`  basins: ${areas.filter((a) => a.rank === 0).map((a) => a.name).join(', ')}`)
