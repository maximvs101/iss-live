import { describe, expect, it } from 'vitest'
import {
  STORAGE_KEY,
  cityFromSearch,
  initialChoice,
  locate,
  placeId,
  readStored,
  roundHere,
  shareUrl,
  writeStored,
} from './place.ts'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

const blocked = new Proxy({} as Storage, {
  get() {
    throw new DOMException('blocked', 'SecurityError')
  },
})

describe('where the page starts from', () => {
  it('prefers a city link over what it remembers', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ kind: 'city', slug: 'lyon-fr' }) })
    expect(initialChoice('?city=paris-fr', storage)).toEqual({ source: 'url', slug: 'paris-fr' })
    expect(initialChoice('', storage)).toEqual({ source: 'stored', stored: { kind: 'city', slug: 'lyon-fr' } })
    expect(initialChoice('', memoryStorage())).toBeNull()
  })

  it('accepts only a slug-shaped city parameter', () => {
    expect(cityFromSearch('?city=saint-denis-fr-2')).toBe('saint-denis-fr-2')
    expect(cityFromSearch('?city=<script>')).toBeNull()
    expect(cityFromSearch('?city=48.85,2.35')).toBeNull()
  })

  // Review focus 5
  it('ignores a stored value it cannot read', () => {
    expect(readStored(memoryStorage({ [STORAGE_KEY]: '{not json' }))).toBeNull()
    expect(readStored(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ kind: 'city' }) }))).toBeNull()
    expect(readStored(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ kind: 'here', latitude: 'x' }) }))).toBeNull()
    expect(readStored(memoryStorage({ [STORAGE_KEY]: JSON.stringify(['paris']) }))).toBeNull()
  })

  it('ignores a remembered place whose zone or coordinates cannot be real', () => {
    // A zone Intl does not know made every date format throw during render: the tool drew nothing,
    // not even the search box that would have let the visitor out, on every visit.
    const stored = (value: object) => readStored(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ kind: 'here', ...value }) }))
    expect(stored({ latitude: 48.8, longitude: 2.3, timeZone: 'Not/AZone' })).toBeNull()
    expect(stored({ latitude: 123, longitude: 2.3, timeZone: 'Europe/Paris' })).toBeNull()
    expect(stored({ latitude: 48.8, longitude: 200, timeZone: 'Europe/Paris' })).toBeNull()
    expect(stored({ latitude: 48.8, longitude: 2.3, timeZone: 'Europe/Paris' })).toEqual({
      kind: 'here',
      latitude: 48.8,
      longitude: 2.3,
      timeZone: 'Europe/Paris',
    })
  })

  it('works with storage blocked', () => {
    expect(readStored(blocked)).toBeNull()
    expect(() => writeStored({ kind: 'city', slug: 'paris-fr' }, blocked)).not.toThrow()
    expect(readStored(null)).toBeNull()
  })

  it('writes, reads back, and forgets', () => {
    const storage = memoryStorage()
    writeStored({ kind: 'here', latitude: 48.9, longitude: 2.3, timeZone: 'Europe/Paris' }, storage)
    expect(readStored(storage)).toEqual({ kind: 'here', latitude: 48.9, longitude: 2.3, timeZone: 'Europe/Paris' })
    writeStored(null, storage)
    expect(readStored(storage)).toBeNull()
  })
})

describe('location', () => {
  it('rounds a position to a tenth of a degree before anything uses it', () => {
    expect(roundHere(48.85661, 2.35222)).toEqual({ latitude: 48.9, longitude: 2.4 })
    expect(roundHere(-33.86785, 151.20732)).toEqual({ latitude: -33.9, longitude: 151.2 })
  })

  it('never hands out coordinates from a geolocated place', async () => {
    const geolocation = {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 48.85661, longitude: 2.35222 } } as GeolocationPosition),
    } as Geolocation
    const place = await locate(geolocation)
    expect(place).toMatchObject({ kind: 'here', latitude: 48.9, longitude: 2.4 })
    expect(shareUrl('paris-fr', 'https://iss-live.pages.dev')).toBe('https://iss-live.pages.dev/passes/?city=paris-fr')
  })

  it('keeps a geolocated position out of anything that can leave the page, the calendar file included', () => {
    // The calendar event's uid was "here-48.9-2.3-…": rounded coordinates in a file people forward
    // as an invitation. Hashed, a 0.1° grid is small enough to recover by brute force; the uid only
    // has to stop the same pass being added twice, and "here" does that.
    expect(placeId({ kind: 'here', latitude: 48.9, longitude: 2.4, timeZone: 'Europe/Paris' })).toBe('here')
  })

  it('rejects when the visitor says no', async () => {
    const geolocation = {
      getCurrentPosition: (_: PositionCallback, fail?: PositionErrorCallback | null) =>
        fail?.({ code: 1, message: 'denied' } as GeolocationPositionError),
    } as Geolocation
    await expect(locate(geolocation)).rejects.toBeTruthy()
  })
})
