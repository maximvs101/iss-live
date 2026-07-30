/**
 * Space weather from NASA's DONKI, read for what it means to the station.
 *
 * DONKI (Database Of Notifications, Knowledge, Information) is the Space Weather Database at
 * Goddard's CCMC. Two of its event types bear directly on the ISS, and the rest do not:
 *
 *  - **Solar flares.** An M- or X-class flare raises the radiation dose in orbit; the crew has
 *    sheltered in the better-shielded Russian modules for the largest of them. C-class and below
 *    are the ordinary background of an active Sun and mean nothing for a crew.
 *  - **Geomagnetic storms.** These are the reason the station's altitude is not a constant. A
 *    storm heats the thermosphere, the air at 420 km expands and thickens, drag rises, and the
 *    orbit decays faster — which is visible in the very elements this application propagates.
 *
 * Coronal mass ejections, energetic particles, shocks and the rest are omitted deliberately: they
 * are the *causes* of the two above, already summarised by them, and a list of everything would
 * bury the two events that matter.
 *
 * **No API key.** `api.nasa.gov` mirrors DONKI but wants one, and a key in a static page is a key
 * published to the world. CCMC serves the same data straight, with `Access-Control-Allow-Origin: *`
 * — verified 30/07/2026 — so the application stays a static page with no secret in it.
 */

const BASE = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get'

const CACHE_KEY = 'iss-live.space-weather'
/** Reports are curated by hand and trickle in over hours; three is plenty often. */
const CACHE_TTL_MS = 3 * 60 * 60 * 1000

/** How far back to look. Long enough to have something to say during a quiet week. */
export const WINDOW_DAYS = 30

export interface Flare {
  id: string
  peak: Date
  /** GOES class as published, e.g. `M1.5`. */
  classType: string
  /** Where on the disc, in NASA's heliographic shorthand, e.g. `S04W16`. Absent for some events. */
  region: string | null
  link: string
}

export interface Storm {
  id: string
  start: Date
  /** Strongest Kp reported during the storm, 0–9. */
  peakKp: number
  link: string
}

export interface SpaceWeather {
  flares: Flare[]
  storms: Storm[]
  /** True when the request failed and this is the last good answer, or nothing at all. */
  stale: boolean
}

/**
 * Order of the GOES flare classes, weakest first.
 *
 * Each step is ten times the X-ray flux of the one before: A is 10⁻⁸ W/m², X is 10⁻⁴. The letter
 * therefore carries far more than the number after it — C9.9 is a tenth of M1.0.
 */
const CLASSES = ['A', 'B', 'C', 'M', 'X'] as const

/** Flux in W/m², so two flares can be compared across classes rather than by string. */
export function flareFlux(classType: string): number {
  const letter = classType[0]?.toUpperCase() ?? ''
  const index = CLASSES.indexOf(letter as (typeof CLASSES)[number])
  if (index === -1) return 0
  const scale = Number.parseFloat(classType.slice(1))
  return (Number.isFinite(scale) ? scale : 1) * 10 ** (index - 8)
}

/** M and above: the threshold at which a flare is worth a crew's attention rather than an index. */
export function isNotableFlare(classType: string): boolean {
  const letter = classType[0]?.toUpperCase() ?? ''
  return letter === 'M' || letter === 'X'
}

/**
 * NOAA's G-scale for a Kp index — the scale space weather is actually reported on.
 *
 * Kp below 5 is not a storm at all, which is why this returns null there rather than "G0": saying
 * nothing is the honest answer for an unremarkable day.
 */
export function stormScale(kp: number): { level: string; label: string } | null {
  if (kp >= 9) return { level: 'G5', label: 'extreme' }
  if (kp >= 8) return { level: 'G4', label: 'severe' }
  if (kp >= 7) return { level: 'G3', label: 'strong' }
  if (kp >= 6) return { level: 'G2', label: 'moderate' }
  if (kp >= 5) return { level: 'G1', label: 'minor' }
  return null
}

/** `YYYY-MM-DD`, the only date format DONKI's query parameters accept. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

interface RawFlare {
  flrID?: string
  peakTime?: string
  beginTime?: string
  classType?: string
  sourceLocation?: string
  link?: string
}

interface RawStorm {
  gstID?: string
  startTime?: string
  allKpIndex?: { kpIndex?: number }[]
  link?: string
}

/**
 * Parsed defensively on purpose.
 *
 * These are hand-curated reports, and fields do go missing — `sourceLocation` is often blank and
 * `classType` has been seen absent. A missing field should cost that one event, or that one
 * detail, and never the panel.
 */
function parseFlares(raw: unknown): Flare[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry: RawFlare) => {
      const time = entry.peakTime ?? entry.beginTime
      const peak = time ? new Date(time) : null
      if (!entry.flrID || !entry.classType || !peak || Number.isNaN(peak.getTime())) return null
      return {
        id: entry.flrID,
        peak,
        classType: entry.classType,
        region: entry.sourceLocation || null,
        link: entry.link ?? '',
      }
    })
    .filter((flare): flare is Flare => flare !== null)
    .sort((a, b) => b.peak.getTime() - a.peak.getTime())
}

function parseStorms(raw: unknown): Storm[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry: RawStorm) => {
      const start = entry.startTime ? new Date(entry.startTime) : null
      if (!entry.gstID || !start || Number.isNaN(start.getTime())) return null
      const readings = (entry.allKpIndex ?? [])
        .map((reading) => reading.kpIndex)
        .filter((kp): kp is number => typeof kp === 'number' && Number.isFinite(kp))
      if (readings.length === 0) return null
      return { id: entry.gstID, start, peakKp: Math.max(...readings), link: entry.link ?? '' }
    })
    .filter((storm): storm is Storm => storm !== null)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
}

interface Cached {
  fetchedAt: number
  flares: (Omit<Flare, 'peak'> & { peak: string })[]
  storms: (Omit<Storm, 'start'> & { start: string })[]
}

function readCache(): Cached | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '') as Cached
    return typeof parsed?.fetchedAt === 'number' ? parsed : null
  } catch {
    return null
  }
}

function revive(cached: Cached): SpaceWeather {
  return {
    flares: cached.flares.map((flare) => ({ ...flare, peak: new Date(flare.peak) })),
    storms: cached.storms.map((storm) => ({ ...storm, start: new Date(storm.start) })),
    stale: true,
  }
}

/**
 * Recent flares and storms.
 *
 * Never throws: space weather is context, not the subject of this application, and a failed
 * request here must not take a panel — let alone the page — down with it. A stale cache is
 * returned rather than nothing, and it says so.
 */
export async function fetchSpaceWeather(days = WINDOW_DAYS, now = new Date()): Promise<SpaceWeather> {
  const cached = readCache()
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...revive(cached), stale: false }
  }

  const start = isoDay(new Date(now.getTime() - days * 86_400_000))
  const end = isoDay(now)
  const range = `startDate=${start}&endDate=${end}`

  try {
    const [flareResponse, stormResponse] = await Promise.all([
      fetch(`${BASE}/FLR?${range}`),
      fetch(`${BASE}/GST?${range}`),
    ])
    if (!flareResponse.ok || !stormResponse.ok) throw new Error('DONKI refused the request')

    const flares = parseFlares(await flareResponse.json())
    const storms = parseStorms(await stormResponse.json())

    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          fetchedAt: Date.now(),
          flares: flares.map((flare) => ({ ...flare, peak: flare.peak.toISOString() })),
          storms: storms.map((storm) => ({ ...storm, start: storm.start.toISOString() })),
        }),
      )
    } catch {
      // A full or disabled storage is not a reason to discard a good answer.
    }

    return { flares, storms, stale: false }
  } catch {
    return cached ? revive(cached) : { flares: [], storms: [], stale: true }
  }
}
