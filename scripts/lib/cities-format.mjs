/** Pure pieces of the city preparation, so they can be tested without the download. */
import { normalise, packetKey } from '../../src/passes/normalise.ts'

export function parseGeonamesLine(text) {
  const c = text.split('\t')
  return {
    id: Number(c[0]),
    name: c[1],
    ascii: c[2],
    latitude: Number(c[4]),
    longitude: Number(c[5]),
    country: c[8],
    population: Number(c[14]),
    timeZone: c[17],
  }
}

const byPopulation = (a, b) => b.population - a.population || a.id - b.id

/** id → slug. The most populous namesake in a country keeps the plain slug. */
export function assignSlugs(cities) {
  const seen = new Map()
  const slugs = new Map()
  for (const city of [...cities].sort(byPopulation)) {
    const base = `${normalise(city.ascii || city.name).replace(/ /g, '-')}-${city.country.toLowerCase()}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    slugs.set(city.id, n === 1 ? base : `${base}-${n}`)
  }
  return slugs
}

const round2 = (x) => Math.round(x * 100) / 100

export function buildPackets(cities) {
  const slugs = assignSlugs(cities)
  const packets = new Map()
  for (const city of [...cities].sort(byPopulation)) {
    const key = normalise(city.ascii || city.name)
    const letter = packetKey(key)
    if (!packets.has(letter)) packets.set(letter, { tz: [], rows: [] })
    const packet = packets.get(letter)
    let zone = packet.tz.indexOf(city.timeZone)
    if (zone === -1) zone = packet.tz.push(city.timeZone) - 1
    packet.rows.push([
      slugs.get(city.id),
      city.name,
      key,
      city.country,
      round2(city.latitude),
      round2(city.longitude),
      zone,
      city.population,
    ])
  }
  return packets
}
