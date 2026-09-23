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
    featureCode: c[7],
  }
}

/*
 * A place a reader would name as a town. GeoNames files city districts (PPLX — "Paris 15 Vaugirard",
 * "Dubai Marina") and historical or abandoned places (PPLH, PPLQ, PPLW) in the same list, and 817
 * districts sit above the population floor, each one crowding a real city out of the search.
 */
const NOT_TOWNS = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW'])
export function isTown(city) {
  return !NOT_TOWNS.has(city.featureCode)
}

/**
 * Numbered districts the feature code does not catch: Paris's arrondissements are coded PPL like
 * any town and Marseille's PPLA5. A name that is another town's name in the same country followed
 * by a number — "Paris 15 Vaugirard", "Marseille 08" — is a part of that town, not another one.
 */
export function dropDistricts(cities) {
  const names = new Set(cities.map((c) => `${normalise(c.name)}|${c.country}`))
  return cities.filter((city) => {
    const numbered = /^(.+?) \d+(?: |$)/.exec(normalise(city.name))
    return !numbered || !names.has(`${numbered[1]}|${city.country}`)
  })
}

/**
 * The spelling a search is matched against, and the slug is made from: the city's own name with its
 * accents folded — exactly what the search box does to what is typed. Not GeoNames' ASCII column,
 * which transliterates ("Zuerich", "Koeln", "Gjong Hoi"): keyed on it, 105 cities could not be found
 * by their own name. A name with no Latin letters at all falls back to the ASCII spelling.
 */
function searchKey(city) {
  return normalise(city.name) || normalise(city.ascii ?? '')
}

const byPopulation = (a, b) => b.population - a.population || a.id - b.id

/** id → slug. The most populous namesake in a country keeps the plain slug. */
export function assignSlugs(cities) {
  const seen = new Map()
  const slugs = new Map()
  for (const city of [...cities].sort(byPopulation)) {
    const base = `${searchKey(city).replace(/ /g, '-')}-${city.country.toLowerCase()}`
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
    const key = searchKey(city)
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
