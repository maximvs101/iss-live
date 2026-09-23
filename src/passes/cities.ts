/**
 * The city search: one letter's file at a time, fetched when that letter is first typed.
 *
 * Nobody downloads the 26,000 cities: a visitor who types "Lyon" fetches the "l" file, and one who
 * follows `?city=lyon-fr` fetches the same file and nothing else. Rows arrive sorted by population,
 * so a prefix filter is already a ranking.
 */
import { normalise, packetKey } from './normalise.ts'

export interface City {
  slug: string
  name: string
  key: string
  country: string
  latitude: number
  longitude: number
  timeZone: string
  population: number
}
export type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>

type Row = [string, string, string, string, number, number, number, number]
interface Packet {
  tz: string[]
  rows: Row[]
}

const packets = new Map<string, Promise<City[]>>()
const defaultFetcher: Fetcher = (url) => fetch(url)

export function clearCityCache(): void {
  packets.clear()
}

export function loadPacket(key: string, fetcher: Fetcher = defaultFetcher): Promise<City[]> {
  let pending = packets.get(key)
  if (!pending) {
    pending = fetcher(`/cities/${key}.json`).then(async (response) => {
      if (!response.ok) throw new Error(`city list ${key} unavailable`)
      const { tz, rows } = (await response.json()) as Packet
      return rows.map(([slug, name, rowKey, country, latitude, longitude, zone, population]) => ({
        slug,
        name,
        key: rowKey,
        country,
        latitude,
        longitude,
        timeZone: tz[zone],
        population,
      }))
    })
    // A failure is not remembered: the next keystroke tries again.
    pending.catch(() => packets.delete(key))
    packets.set(key, pending)
  }
  return pending
}

export async function searchCities(query: string, limit = 8, fetcher?: Fetcher): Promise<City[]> {
  const q = normalise(query)
  if (!q) return []
  const cities = await loadPacket(packetKey(q), fetcher)
  const found: City[] = []
  for (const city of cities) {
    if (city.key.startsWith(q)) found.push(city)
    if (found.length === limit) break
  }
  return found
}

/**
 * The city a slug names, `null` if there is none — and a rejection if nobody could be asked.
 *
 * The server answering "no such file" settles it: the city is unknown. No answer at all settles
 * nothing, and used to read the same — a shared link opened on a bad connection said "not one we
 * know" about a city that was fine. That case rejects, and the page says the list could not load.
 */
export async function findCity(slug: string, fetcher: Fetcher = defaultFetcher): Promise<City | null> {
  const key = packetKey(slug)
  let response: Awaited<ReturnType<Fetcher>> | null = null
  const probe: Fetcher = async (url) => (response = await fetcher(url))
  const cities = await loadPacket(key, probe).catch((error) => {
    if (response && !response.ok) return [] as City[]
    throw error
  })
  return cities.find((city) => city.slug === slug) ?? null
}

let names: Intl.DisplayNames | null = null
export function countryName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return names.of(code) ?? code
  } catch {
    return code
  }
}
