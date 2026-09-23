import { afterEach, describe, expect, it } from 'vitest'
import { twoline2satrec } from 'satellite.js'
import { nextPassLine, nextVisible } from './nextPass.ts'
import { clearCityCache, type Fetcher } from '../passes/cities.ts'
import { STORAGE_KEY } from '../passes/place.ts'
import type { OrbitalElements } from '../orbit/tle.ts'

afterEach(() => clearCityCache())

const elements: OrbitalElements = {
  satrec: twoline2satrec(
    '1 25544U 98067A   26209.15252568  .00016717  00000+0  30074-3 0  9993',
    '2 25544  51.6393 210.5107 0002140 106.5723 253.5556 15.50022337 12345',
  ),
  epoch: new Date('2026-07-28T03:39:38Z'),
  source: 'reseau',
  objectName: 'ISS (ZARYA)',
}
const NOW = Date.parse('2026-07-28T00:00:00Z')
const fetcher: Fetcher = async (url) =>
  url === '/cities/p.json'
    ? { ok: true, json: async () => ({ tz: ['Europe/Paris'], rows: [['paris-fr', 'Paris', 'paris', 'FR', 48.85, 2.35, 0, 2138551]] }) }
    : { ok: false, json: async () => null }
const stored = (value: string | null): Storage => ({ getItem: (k: string) => (k === STORAGE_KEY ? value : null) }) as Storage

describe('nextVisible', () => {
  it('finds the next visible pass for the remembered city', async () => {
    const next = await nextVisible(stored(JSON.stringify({ kind: 'city', slug: 'paris-fr' })), elements, NOW, fetcher)
    expect(next.kind).toBe('pass')
    if (next.kind !== 'pass') return
    expect(next.pass.visible!.end.date.getTime()).toBeGreaterThan(NOW)
    expect(nextPassLine(next, NOW)).toMatch(
      /^Next visible from Paris: (today|tomorrow|\w{3} \d+) at \d\d:\d\d · (very bright|bright|visible but faint)$/,
    )
  })

  // Review focus 4
  it('asks for a city when none is remembered, or the one remembered is unreadable or unknown', async () => {
    expect((await nextVisible(stored(null), elements, NOW, fetcher)).kind).toBe('ask')
    expect((await nextVisible(stored('{broken'), elements, NOW, fetcher)).kind).toBe('ask')
    expect((await nextVisible(stored(JSON.stringify({ kind: 'city', slug: 'atlantis-xx' })), elements, NOW, fetcher)).kind).toBe('ask')
    expect((await nextVisible(null, elements, NOW, fetcher)).kind).toBe('ask')
    expect(nextPassLine({ kind: 'ask' }, NOW)).toBe('When can you see it from your city?')
  })

  it('works for a remembered position, named as such', async () => {
    const here = JSON.stringify({ kind: 'here', latitude: 48.9, longitude: 2.4, timeZone: 'Europe/Paris' })
    const next = await nextVisible(stored(here), elements, NOW, fetcher)
    expect(next.kind).toBe('pass')
    expect(nextPassLine(next, NOW)).toMatch(/^Next visible from your location: /)
  })

  it('gives no time from elements too old to give one', async () => {
    const next = await nextVisible(
      stored(JSON.stringify({ kind: 'city', slug: 'paris-fr' })),
      elements,
      Date.parse('2026-09-23T00:00:00Z'),
      fetcher,
    )
    expect(next.kind).toBe('stale')
  })
})
