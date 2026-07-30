/**
 * Tests for fetching and parsing DONKI.
 *
 * These are hand-curated reports and their fields do go missing — `sourceLocation` is routinely
 * blank, and a storm can arrive with an empty `allKpIndex`. Space weather is context here, beside
 * live telemetry, so a gap in someone else's database must cost that one event and never the page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSpaceWeather } from './donki'

const FLARE = {
  flrID: '2026-07-04T09:00:00-FLR-001',
  peakTime: '2026-07-04T09:12Z',
  beginTime: '2026-07-04T09:00Z',
  classType: 'X1.3',
  sourceLocation: 'S10E85',
  link: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/FLR/1/-1',
}

const STORM = {
  gstID: '2026-07-04T00:00:00-GST-001',
  startTime: '2026-07-04T00:00Z',
  allKpIndex: [
    { observedTime: '2026-07-04T03:00Z', kpIndex: 6 },
    { observedTime: '2026-07-04T06:00Z', kpIndex: 7.33 },
    { observedTime: '2026-07-04T09:00Z', kpIndex: 5.67 },
  ],
  link: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/GST/1/-1',
}

/** Answers FLR and GST from the same stub, matching on the path. */
function serve(flares: unknown, storms: unknown) {
  return vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('/FLR') ? flares : storms),
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchSpaceWeather', () => {
  it('asks CCMC, which needs no API key', async () => {
    // `api.nasa.gov` mirrors the same data and wants a key, and a key in a static page is a key
    // published to the world.
    const fetchMock = serve([FLARE], [STORM])
    vi.stubGlobal('fetch', fetchMock)

    await fetchSpaceWeather()
    for (const [url] of fetchMock.mock.calls) {
      expect(url).toContain('kauai.ccmc.gsfc.nasa.gov')
      expect(url).not.toContain('api_key')
    }
  })

  it('asks for the window it says it does', async () => {
    const fetchMock = serve([], [])
    vi.stubGlobal('fetch', fetchMock)

    await fetchSpaceWeather(30, new Date('2026-07-30T12:00:00Z'))
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('startDate')).toBe('2026-06-30')
    expect(url.searchParams.get('endDate')).toBe('2026-07-30')
  })

  it('reads a flare and takes the peak, not the start', async () => {
    vi.stubGlobal('fetch', serve([FLARE], []))
    const { flares } = await fetchSpaceWeather()
    expect(flares).toHaveLength(1)
    expect(flares[0].classType).toBe('X1.3')
    expect(flares[0].region).toBe('S10E85')
    expect(flares[0].peak.toISOString()).toBe('2026-07-04T09:12:00.000Z')
  })

  it('takes the strongest Kp of a storm, not the first', async () => {
    // A storm is reported as a series of three-hourly readings; its severity is the peak.
    vi.stubGlobal('fetch', serve([], [STORM]))
    const { storms } = await fetchSpaceWeather()
    expect(storms[0].peakKp).toBe(7.33)
  })

  it('drops an event it cannot read, and keeps the rest', async () => {
    vi.stubGlobal('fetch', serve([{ flrID: 'x' }, FLARE, { peakTime: 'nonsense' }], [{ gstID: 'y' }, STORM]))
    const { flares, storms } = await fetchSpaceWeather()
    expect(flares).toHaveLength(1)
    expect(storms).toHaveLength(1)
  })

  it('treats a blank source location as unknown rather than as an empty string', async () => {
    vi.stubGlobal('fetch', serve([{ ...FLARE, sourceLocation: '' }], []))
    expect((await fetchSpaceWeather()).flares[0].region).toBeNull()
  })

  it('drops a storm with no Kp readings at all', async () => {
    // Its severity is unknowable, and a storm row with a blank magnitude says nothing.
    vi.stubGlobal('fetch', serve([], [{ ...STORM, allKpIndex: [] }]))
    expect((await fetchSpaceWeather()).storms).toHaveLength(0)
  })

  it('sorts newest first', async () => {
    const older = { ...FLARE, flrID: 'older', peakTime: '2026-07-01T00:00Z' }
    vi.stubGlobal('fetch', serve([older, FLARE], []))
    const { flares } = await fetchSpaceWeather()
    expect(flares.map((flare) => flare.id)).toEqual([FLARE.flrID, 'older'])
  })

  it('says so, rather than throwing, when DONKI is unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    const weather = await fetchSpaceWeather()
    expect(weather.stale).toBe(true)
    expect(weather.flares).toEqual([])
  })

  it('says so when DONKI answers with an error', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 }))
    expect((await fetchSpaceWeather()).stale).toBe(true)
  })

  it('is not answering junk in place of a list', async () => {
    // A gateway that returns an HTML error page with a 200 is the classic quiet failure.
    vi.stubGlobal('fetch', serve({ error: 'nope' }, 'not an array'))
    const weather = await fetchSpaceWeather()
    expect(weather.flares).toEqual([])
    expect(weather.storms).toEqual([])
  })
})
