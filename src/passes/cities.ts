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

/** A slug whose letter has no file is a city we do not know, not an error to show. */
export async function findCity(slug: string, fetcher?: Fetcher): Promise<City | null> {
  const cities = await loadPacket(packetKey(slug), fetcher).catch(() => [])
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
