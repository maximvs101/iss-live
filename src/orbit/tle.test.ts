// @vitest-environment jsdom
/**
 * Loading the orbital elements, along the paths nobody takes.
 *
 * The happy one runs every time the page opens and needs no test: Celestrak answers, the elements
 * parse, the station is where it should be — `verify:orbit` checks that against an independent
 * source to within a kilometre. What had never run once is everything underneath it: the six-hour
 * cache actually being used instead of the network, a stale cache being preferred to nothing when
 * the network fails, and the built-in fallback elements carrying a first load with no cache and no
 * connection.
 *
 * Those three exist so the application can show an orbit offline, which is a promise made in the
 * module's own header and was, until now, entirely unverified.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { elementsAgeHours, loadOrbitalElements } from './tle'

const CACHE_KEY = 'iss-live.orbital-elements'
const SIX_HOURS_MS = 6 * 60 * 60 * 1000

/**
 * Elements in Celestrak's OMM JSON shape, matching the TLE the module falls back to.
 *
 * Written out rather than fetched: the point of these tests is what happens when the network is
 * not there.
 */
function omm(epoch = '2026-07-28T03:39:38.221000') {
  return {
    OBJECT_NAME: 'ISS (ZARYA)',
    OBJECT_ID: '1998-067A',
    EPOCH: epoch,
    MEAN_MOTION: 15.49220842,
    ECCENTRICITY: 0.0007093,
    INCLINATION: 51.632,
    RA_OF_ASC_NODE: 97.3682,
    ARG_OF_PERICENTER: 345.612,
    MEAN_ANOMALY: 14.4666,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: 25544,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 57810,
    BSTAR: 0.00020282,
    MEAN_MOTION_DOT: 0.00010831,
    MEAN_MOTION_DDOT: 0,
  }
}

function cache(fetchedAt: number) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt, omm: omm() }))
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loading the orbital elements', () => {
  it('uses a cache younger than six hours without touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    cache(Date.now() - SIX_HOURS_MS / 2)

    const elements = await loadOrbitalElements()

    expect(elements.source).toBe('cache')
    // Celestrak publishes a few times a day; asking it more often than that is rude and pointless.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refreshes once the cache is past its six hours, and writes the answer back', async () => {
    cache(Date.now() - SIX_HOURS_MS - 1)
    const fresh = omm('2026-08-02T01:02:03.000000')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([fresh]), { status: 200 }),
    )

    const elements = await loadOrbitalElements()

    expect(elements.source).toBe('reseau')
    // Read as UTC, not as the machine's local time. This assertion found the opposite: Celestrak
    // sends no zone designator, so the epoch was landing hours out on any machine off Greenwich.
    expect(elements.epoch.toISOString()).toBe('2026-08-02T01:02:03.000Z')
    // Written back, or the next load would go to the network again.
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    expect(stored.omm.EPOCH).toBe(fresh.EPOCH)
  })

  it('prefers a stale cache to no elements at all when the network fails', async () => {
    cache(Date.now() - 5 * 24 * 3600_000)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    const elements = await loadOrbitalElements()

    // Five-day-old elements drift by a few kilometres a day. That is worth showing, with its age
    // on screen, rather than nothing.
    expect(elements.source).toBe('cache')
    expect(elementsAgeHours(elements, Date.parse('2026-08-02T00:00:00Z'))).toBeGreaterThan(24)
  })

  it('falls back to the built-in elements on a first load with no network', async () => {
    // No cache, no connection: the case the fallback exists for, and the one a developer with
    // working internet never sees.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    const elements = await loadOrbitalElements()

    expect(elements.source).toBe('secours')
    expect(elements.objectName).toBe('ISS (ZARYA)')
    // The epoch is rebuilt from the satrec's year and day-of-year fields rather than parsed from a
    // string, which is its own small opportunity to be a year or a day out.
    expect(elements.epoch.toISOString().slice(0, 10)).toBe('2026-07-28')
  })

  it('treats an HTTP error and a malformed payload as a failed fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }))
    expect((await loadOrbitalElements()).source).toBe('secours')

    // Celestrak answering 200 with an empty array is not a success either.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }))
    expect((await loadOrbitalElements()).source).toBe('secours')
  })

  it('ignores a cache entry that is not shaped like one', async () => {
    localStorage.setItem(CACHE_KEY, '{"fetchedAt":"yesterday"}')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    expect((await loadOrbitalElements()).source).toBe('secours')
  })
})
