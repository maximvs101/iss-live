/**
 * Orbital elements for the ISS.
 *
 * The station's position is not broadcast by the ISS Live stream: the catalogue's TOPO discipline
 * publishes only a state-vector time tag. It is therefore computed from the orbital elements
 * maintained by Celestrak, which allows requests straight from a browser
 * (`Access-Control-Allow-Origin: *`, verified 28/07/2026).
 *
 * Elements go stale slowly — a few kilometres of error per day of age — so their epoch is kept
 * and displayed rather than hidden.
 */
import { json2satrec, twoline2satrec, type OMMJsonObject, type SatRec } from 'satellite.js'

const ISS_NORAD_ID = 25544

const CELESTRAK_URL = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${ISS_NORAD_ID}&FORMAT=json`
const CACHE_KEY = 'iss-live.orbital-elements'
/** Celestrak publishes new elements several times a day; we query at most every 6 hours. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Fallback elements, used when the network is unavailable on first load.
 * Taken from Celestrak on 28/07/2026 (epoch 2026-07-28T03:39:38Z).
 */
const FALLBACK_TLE = {
  line1: '1 25544U 98067A   26209.15252568  .00010831  00000+0  20282-3 0  9992',
  line2: '2 25544  51.6320  97.3682 0007093 345.6120  14.4666 15.49220842578109',
}

export type ElementsSource = 'reseau' | 'cache' | 'secours'

export interface OrbitalElements {
  satrec: SatRec
  /** Reference date of the elements: the older it is, the less precise the position. */
  epoch: Date
  source: ElementsSource
  objectName: string
}

interface CachedElements {
  fetchedAt: number
  omm: OMMJsonObject
}

function readCache(): CachedElements | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedElements
    if (typeof parsed.fetchedAt !== 'number' || !parsed.omm) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(omm: OMMJsonObject): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), omm }))
  } catch {
    // Storage unavailable (private browsing, quota): we do without.
  }
}

function fromOmm(omm: OMMJsonObject, source: ElementsSource): OrbitalElements {
  return {
    satrec: json2satrec(omm),
    epoch: new Date(omm.EPOCH),
    source,
    objectName: omm.OBJECT_NAME,
  }
}

function fromFallback(): OrbitalElements {
  const satrec = twoline2satrec(FALLBACK_TLE.line1, FALLBACK_TLE.line2)
  return {
    satrec,
    epoch: epochFromSatrec(satrec),
    source: 'secours',
    objectName: 'ISS (ZARYA)',
  }
}

/** Rebuilds the epoch date from the satrec's year and day-of-year fields. */
function epochFromSatrec(satrec: SatRec): Date {
  const year = satrec.epochyr < 57 ? satrec.epochyr + 2000 : satrec.epochyr + 1900
  const start = Date.UTC(year, 0, 1)
  return new Date(start + (satrec.epochdays - 1) * 86_400_000)
}

/**
 * Loads the orbital elements: fresh cache, else network, else stale cache, else fallback.
 * Never throws: the application must be able to show an orbit even offline.
 */
export async function loadOrbitalElements(): Promise<OrbitalElements> {
  const cached = readCache()
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return fromOmm(cached.omm, 'cache')
  }

  try {
    const response = await fetch(CELESTRAK_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = (await response.json()) as OMMJsonObject[]
    const omm = payload[0]
    if (!omm?.EPOCH) throw new Error('reponse Celestrak inattendue')
    writeCache(omm)
    return fromOmm(omm, 'reseau')
  } catch (error) {
    console.warn('[orbit] orbital elements not refreshed:', error)
    if (cached) return fromOmm(cached.omm, 'cache')
    return fromFallback()
  }
}

/** Age of the elements, in hours. Beyond a few days the position drifts noticeably. */
export function elementsAgeHours(elements: OrbitalElements, now = Date.now()): number {
  return (now - elements.epoch.getTime()) / 3_600_000
}

export const ELEMENTS_SOURCE_LABELS: Record<ElementsSource, string> = {
  reseau: 'Celestrak',
  cache: 'Celestrak (local cache)',
  secours: 'built-in fallback elements',
}
