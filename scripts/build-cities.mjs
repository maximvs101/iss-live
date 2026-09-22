/**
 * The city list behind the search box on /passes/, from GeoNames.
 *
 * Run by hand, like build:marine, and the output is committed: the build never touches the network,
 * and a change in the data is a commit someone can read. GeoNames `cities15000`, kept above the population
 * floor set below, under CC BY 4.0, which asks for the attribution the page and /about/ carry.
 *
 * One file per first letter, so the page fetches only the letter being typed, and a shared link
 * `?city=lyon-fr` only the "l" file.
 *
 * Usage: npm run build:cities            (downloads about 3 MB)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { gzipSync, inflateRawSync } from 'node:zlib'
import { buildPackets, dropDistricts, isTown, parseGeonamesLine } from './lib/cities-format.mjs'

const SOURCE = 'https://download.geonames.org/export/dump/cities15000.zip'
const OUT = new URL('../public/cities/', import.meta.url)
/*
 * GeoNames' floor is 15,000, but that is 34,000 places and a 105 kB file for the letter "s" alone —
 * more than the whole page. The floor is set by what one letter costs a visitor, measured on
 * 22 September 2026: at 25,000 the "s" file is still 70 kB; at 50,000 it is 38 kB and all 27 files
 * come to 353 kB. A town below the floor has a listed neighbour within a few tens of kilometres,
 * which moves a pass by seconds, and "Use my location" covers everyone.
 */
const MIN_POPULATION = Number(process.env.MIN_POPULATION ?? 50_000)

/** The one file in a zip archive, read through the central directory. No dependency needed. */
function unzipOnly(buffer) {
  let eocd = buffer.length - 22
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('not a zip archive')
  const cd = buffer.readUInt32LE(eocd + 16)
  if (buffer.readUInt32LE(cd) !== 0x02014b50) throw new Error('central directory not found')
  const method = buffer.readUInt16LE(cd + 10)
  const size = buffer.readUInt32LE(cd + 20)
  const local = buffer.readUInt32LE(cd + 42)
  const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
  const data = buffer.subarray(start, start + size)
  if (method === 0) return data.toString('utf8')
  if (method === 8) return inflateRawSync(data).toString('utf8')
  throw new Error(`zip method ${method} not supported`)
}

// Kept in .cache/ so that trying another population floor does not download the archive again.
const CACHE = new URL('../.cache/cities15000.zip', import.meta.url)
if (!existsSync(CACHE)) {
  const response = await fetch(SOURCE)
  if (!response.ok) throw new Error(`${SOURCE}: HTTP ${response.status}`)
  mkdirSync(new URL('./', CACHE), { recursive: true })
  writeFileSync(CACHE, Buffer.from(await response.arrayBuffer()))
}
const text = unzipOnly(readFileSync(CACHE))
const cities = text
  .split('\n')
  .filter(Boolean)
  .map(parseGeonamesLine)
  .filter((c) => c.name && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && c.timeZone)
  .filter((c) => c.population >= MIN_POPULATION && isTown(c))

// A truncated download or a changed format would otherwise ship a short list without a word.
if (cities.length < 5_000) throw new Error(`only ${cities.length} cities parsed — the download is short or the format changed`)

const towns = dropDistricts(cities)
const packets = buildPackets(towns)
const slugs = new Set()
for (const packet of packets.values()) {
  for (const row of packet.rows) {
    if (slugs.has(row[0])) throw new Error(`duplicate slug ${row[0]}`)
    slugs.add(row[0])
  }
}

mkdirSync(OUT, { recursive: true })
for (const file of readdirSync(OUT)) rmSync(new URL(file, OUT))
let total = 0
for (const [key, packet] of [...packets].sort()) {
  const json = JSON.stringify(packet)
  writeFileSync(new URL(`${key}.json`, OUT), json)
  const gz = gzipSync(json).length
  total += gz
  console.log(
    `${key}.json  ${String(packet.rows.length).padStart(5)} cities  ${(json.length / 1024).toFixed(0).padStart(4)} kB  ${(gz / 1024).toFixed(0).padStart(3)} kB gz`,
  )
}
console.log(`\n${towns.length} cities, ${packets.size} files, ${(total / 1024).toFixed(0)} kB compressed in all`)
