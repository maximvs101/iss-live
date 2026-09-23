/**
 * Where the passes are computed for, and where that choice is kept.
 *
 * A position from the browser is rounded to a tenth of a degree — ten kilometres, nothing to a
 * pass — before anything else sees it, and it never goes into a link: a shared URL would otherwise
 * carry someone's front door. Links name cities; the browser remembers either, in storage that
 * may be blocked, and the page must not care if it is.
 */
import { countryName, findCity, type City, type Fetcher } from './cities.ts'

export type Place =
  | { kind: 'city'; city: City }
  | { kind: 'here'; latitude: number; longitude: number; timeZone: string }
export type Stored =
  | { kind: 'city'; slug: string }
  | { kind: 'here'; latitude: number; longitude: number; timeZone: string }
export type Choice = { source: 'url'; slug: string } | { source: 'stored'; stored: Stored }

export const STORAGE_KEY = 'iss-live.passes-place'
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isStored(value: unknown): value is Stored {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (v.kind === 'city') return typeof v.slug === 'string' && SLUG.test(v.slug)
  if (v.kind === 'here') {
    return (
      typeof v.latitude === 'number' &&
      Math.abs(v.latitude) <= 90 &&
      typeof v.longitude === 'number' &&
      Math.abs(v.longitude) <= 180 &&
      typeof v.timeZone === 'string' &&
      isZone(v.timeZone)
    )
  }
  return false
}

/*
 * A zone `Intl` knows. Anything else throws from every date format the list draws, so a bad one
 * remembered would leave the tool blank on every visit — with no search box to get out through.
 */
function isZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

export function readStored(storage: Storage | null): Stored | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    return isStored(value) ? value : null
  } catch {
    return null
  }
}

export function writeStored(value: Stored | null, storage: Storage | null): void {
  try {
    if (value) storage?.setItem(STORAGE_KEY, JSON.stringify(value))
    else storage?.removeItem(STORAGE_KEY)
  } catch {
    // Blocked or full: the page works without remembering.
  }
}

export function cityFromSearch(search: string): string | null {
  const slug = new URLSearchParams(search).get('city')
  return slug && slug.length <= 80 && SLUG.test(slug) ? slug : null
}

export function initialChoice(search: string, storage: Storage | null): Choice | null {
  const slug = cityFromSearch(search)
  if (slug) return { source: 'url', slug }
  const stored = readStored(storage)
  return stored ? { source: 'stored', stored } : null
}

export async function resolveChoice(choice: Choice, fetcher?: Fetcher): Promise<Place | null> {
  const stored: Stored = choice.source === 'url' ? { kind: 'city', slug: choice.slug } : choice.stored
  if (stored.kind === 'here') return stored
  const city = await findCity(stored.slug, fetcher)
  return city ? { kind: 'city', city } : null
}

export function toStored(place: Place): Stored {
  return place.kind === 'city' ? { kind: 'city', slug: place.city.slug } : place
}

export function roundHere(latitude: number, longitude: number) {
  return { latitude: Math.round(latitude * 10) / 10, longitude: Math.round(longitude * 10) / 10 }
}

export function locate(geolocation: Geolocation): Promise<Place> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude } = roundHere(coords.latitude, coords.longitude)
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
        resolve({ kind: 'here', latitude, longitude, timeZone })
      },
      reject,
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 15_000 },
    )
  })
}

export function placeLabel(place: Place): string {
  return place.kind === 'city' ? `${place.city.name}, ${countryName(place.city.country)}` : 'your location'
}

export function placeTimeZone(place: Place): string {
  return place.kind === 'city' ? place.city.timeZone : place.timeZone
}

export function placeId(place: Place): string {
  return place.kind === 'city' ? place.city.slug : `here-${place.latitude}-${place.longitude}`
}

export function shareUrl(slug: string, origin: string): string {
  return `${origin}/passes/?city=${slug}`
}
