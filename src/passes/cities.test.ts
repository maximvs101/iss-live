import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCityCache, countryName, findCity, searchCities, type Fetcher } from './cities.ts'

const PACKETS: Record<string, unknown> = {
  '/cities/s.json': {
    tz: ['America/Sao_Paulo', 'Europe/Paris'],
    rows: [
      ['sao-paulo-br', 'São Paulo', 'sao paulo', 'BR', -23.55, -46.64, 0, 10021295],
      ['saint-etienne-fr', 'Saint-Étienne', 'saint etienne', 'FR', 45.43, 4.39, 1, 171483],
    ],
  },
  '/cities/p.json': {
    tz: ['Europe/Paris', 'America/Chicago'],
    rows: [
      ['paris-fr', 'Paris', 'paris', 'FR', 48.85, 2.35, 0, 2138551],
      ['paris-us', 'Paris', 'paris', 'US', 33.66, -95.56, 1, 24782],
    ],
  },
}

function fakeFetch(): Fetcher & { calls: string[] } {
  const calls: string[] = []
  const f = (async (url: string) => {
    calls.push(url)
    return url in PACKETS ? { ok: true, json: async () => PACKETS[url] } : { ok: false, json: async () => null }
  }) as Fetcher & { calls: string[] }
  f.calls = calls
  return f
}

afterEach(() => clearCityCache())

describe('searchCities', () => {
  // Review focus 4
  it('finds Saint-Étienne however it is typed', async () => {
    const f = fakeFetch()
    for (const typed of ['saint-etienne', 'Saint Étienne', '  SAINT-ÉT', 'saint e']) {
      expect((await searchCities(typed, 8, f)).map((c) => c.slug)).toContain('saint-etienne-fr')
    }
  })

  it('ranks by population and fetches the letter once', async () => {
    const f = fakeFetch()
    expect((await searchCities('par', 8, f)).map((c) => c.slug)).toEqual(['paris-fr', 'paris-us'])
    await searchCities('pari', 8, f)
    expect(f.calls).toEqual(['/cities/p.json'])
  })

  it('returns nothing for an empty query without fetching', async () => {
    const f = fakeFetch()
    expect(await searchCities('  -- ', 8, f)).toEqual([])
    expect(f.calls).toEqual([])
  })

  it('lets a failed letter be tried again', async () => {
    const f = vi.fn<Fetcher>().mockResolvedValueOnce({ ok: false, json: async () => null })
    f.mockResolvedValueOnce({ ok: true, json: async () => PACKETS['/cities/p.json'] })
    await expect(searchCities('paris', 8, f)).rejects.toThrow()
    expect(await searchCities('paris', 8, f)).toHaveLength(2)
  })
})

describe('findCity', () => {
  it('resolves a slug from its own letter, time zone included', async () => {
    const f = fakeFetch()
    const city = await findCity('paris-us', f)
    expect(city).toMatchObject({ name: 'Paris', country: 'US', timeZone: 'America/Chicago', latitude: 33.66 })
    expect(f.calls).toEqual(['/cities/p.json'])
    expect(await findCity('atlantis-xx', f)).toBeNull()
  })
})

describe('findCity when the list cannot be reached', () => {
  it('fails rather than calling the city unknown', async () => {
    // A shared link opened on a bad connection said "That city link is not one we know": the link
    // was fine, the network was not. An answer from the server settles it; no answer does not.
    const offline: Fetcher = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(findCity('paris-fr', offline)).rejects.toThrow()
  })
})

describe('countryName', () => {
  it('names the country in English', () => {
    expect(countryName('FR')).toBe('France')
    expect(countryName('US')).toBe('United States')
  })
})
