import { describe, expect, it } from 'vitest'
import { fetchStatus, statusLine } from './status.ts'

const answer = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch

describe('fetchStatus', () => {
  it('reads the collector’s answer', async () => {
    expect(
      await fetchStatus('https://x/status', answer({ live: false, lastLive: '2026-09-14T14:14:20Z', checkedAt: 'x' })),
    ).toEqual({ live: false, lastLive: '2026-09-14T14:14:20Z' })
  })

  // Review focus 2
  it('gives up on a slow or malformed answer, or none at all', async () => {
    expect(await fetchStatus(null, answer({ live: true, lastLive: null }))).toBeNull()
    expect(await fetchStatus('https://x/status', answer({ live: 'yes' }))).toBeNull()
    expect(await fetchStatus('https://x/status', answer({}, false))).toBeNull()
    const failing = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await fetchStatus('https://x/status', failing)).toBeNull()
    const never = (() => new Promise(() => {})) as unknown as typeof fetch
    expect(await fetchStatus('https://x/status', never, 20)).toBeNull()
  })
})

describe('statusLine', () => {
  it('names the month the same way whatever the runtime', () => {
    // en-GB gave "Sept" on one ICU and "Sep" on another; the line and its test depended on which.
    expect(statusLine({ live: false, lastLive: '2026-06-03T00:00:00Z' })).toBe('NASA’s broadcast silent since 3 Jun')
    expect(statusLine({ live: false, lastLive: '2026-09-30T23:59:59Z' })).toBe('NASA’s broadcast silent since 30 Sep')
  })

  it('says live, or since when it has been silent', () => {
    expect(statusLine({ live: true, lastLive: '2026-09-23T11:55:12Z' })).toBe('live telemetry from the station')
    expect(statusLine({ live: false, lastLive: '2026-09-14T14:14:20Z' })).toBe('NASA’s broadcast silent since 14 Sep')
    expect(statusLine({ live: false, lastLive: null })).toBe('NASA’s broadcast is silent')
  })
})
