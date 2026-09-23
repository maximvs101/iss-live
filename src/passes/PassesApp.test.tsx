// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { twoline2satrec } from 'satellite.js'
import { PassesApp } from './PassesApp.tsx'
import { clearCityCache, type Fetcher } from './cities.ts'
import { STORAGE_KEY } from './place.ts'
import type { OrbitalElements } from '../orbit/tle.ts'

afterEach(() => {
  cleanup()
  clearCityCache()
})

const satrec = twoline2satrec(
  '1 25544U 98067A   26209.15252568  .00016717  00000+0  30074-3 0  9993',
  '2 25544  51.6393 210.5107 0002140 106.5723 253.5556 15.50022337 12345',
)
const elements: OrbitalElements = {
  satrec,
  epoch: new Date('2026-07-28T03:39:38Z'),
  source: 'reseau',
  objectName: 'ISS (ZARYA)',
}
const clock = () => Date.parse('2026-07-28T00:00:00Z')
const loadElements = async () => elements
const fetcher: Fetcher = async (url) =>
  url === '/cities/p.json'
    ? {
        ok: true,
        json: async () => ({ tz: ['Europe/Paris'], rows: [['paris-fr', 'Paris', 'paris', 'FR', 48.85, 2.35, 0, 2138551]] }),
      }
    : { ok: false, json: async () => null }

function memoryStorage(): Storage {
  const data = new Map<string, string>()
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

describe('PassesApp', () => {
  it('lists the passes for a city from a link, visible ones first-class', async () => {
    render(
      <PassesApp loadElements={loadElements} clock={clock} storage={memoryStorage()} search="?city=paris-fr" geolocation={null} fetcher={fetcher} />,
    )
    await screen.findByText('Paris, France')
    expect(await screen.findAllByRole('button', { name: /Add the .* pass to your calendar/ })).not.toHaveLength(0)
    expect(screen.getByText(/times in Europe\/Paris/)).toBeTruthy()
  })

  it('searches, picks with the keyboard, and remembers the choice', async () => {
    const storage = memoryStorage()
    render(<PassesApp loadElements={loadElements} clock={clock} storage={storage} search="" geolocation={null} fetcher={fetcher} />)
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: 'par' } })
    await screen.findByRole('option', { name: 'Paris, France' })
    fireEvent.keyDown(box, { key: 'Enter' })
    await screen.findByText('Paris, France')
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual({ kind: 'city', slug: 'paris-fr' })
  })

  it('says so when a city link names no known city', async () => {
    render(
      <PassesApp loadElements={loadElements} clock={clock} storage={memoryStorage()} search="?city=atlantis-xx" geolocation={null} fetcher={fetcher} />,
    )
    await screen.findByText(/not one we know/)
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('tells a network failure from an unknown city', async () => {
    const offline: Fetcher = async () => {
      throw new TypeError('Failed to fetch')
    }
    document.documentElement.classList.add('passes-expecting')
    render(<PassesApp loadElements={loadElements} clock={clock} storage={memoryStorage()} search="?city=paris-fr" geolocation={null} fetcher={offline} />)
    await screen.findByText(/city list could not be loaded/)
    expect(screen.queryByText(/not one we know/)).toBeNull()
    expect(document.documentElement.classList.contains('passes-expecting')).toBe(false)
  })

  it('shows no times at all from elements too old to give them', async () => {
    // The built-in set dates from late July. If the current one cannot be fetched on a first visit,
    // two months later, minute-precise times came out of it under a note saying they "can move by
    // minutes" — when the drift is by then far larger.
    const old = async (): Promise<OrbitalElements> => ({ ...elements, source: 'secours' })
    const twoMonthsOn = () => Date.parse('2026-09-23T00:00:00Z')
    render(<PassesApp loadElements={old} clock={twoMonthsOn} storage={memoryStorage()} search="?city=paris-fr" geolocation={null} fetcher={fetcher} />)
    await screen.findByText(/too old to give the times of passes/)
    expect(screen.queryAllByRole('button', { name: /Add the .* pass to your calendar/ })).toHaveLength(0)
  })

  // Review focus 2, at the page
  it('explains a week with nothing to see', async () => {
    const tromso: Fetcher = async () => ({
      ok: true,
      json: async () => ({ tz: ['Europe/Oslo'], rows: [['tromso-no', 'Tromsø', 'tromso', 'NO', 69.65, 18.96, 0, 38980]] }),
    })
    render(
      <PassesApp loadElements={loadElements} clock={clock} storage={memoryStorage()} search="?city=tromso-no" geolocation={null} fetcher={tromso} />,
    )
    await screen.findByText(/None of the next \d+ passes can be seen from Tromsø, Norway/)
  })

  it('holds a screen of room while a known place loads, so the text below does not jump', async () => {
    // Lighthouse measured 0.449 of layout shift on /passes/?city=paris-fr: the list arrived after
    // load and pushed every paragraph under it down the screen. The room is claimed before the first
    // paint by a class the page's head sets on <html>; the app lets it go once the list is there.
    document.documentElement.classList.add('passes-expecting')
    let release: (e: OrbitalElements) => void = () => {}
    const slow = () => new Promise<OrbitalElements>((resolve) => (release = resolve))
    render(<PassesApp loadElements={slow} clock={clock} storage={memoryStorage()} search="?city=paris-fr" geolocation={null} fetcher={fetcher} />)
    await screen.findByText('Paris, France')
    expect(document.documentElement.classList.contains('passes-expecting')).toBe(true)
    release(elements)
    await screen.findAllByRole('button', { name: /Add the .* pass to your calendar/ })
    expect(document.documentElement.classList.contains('passes-expecting')).toBe(false)
  })

  it('lets the room go when a link names no known city', async () => {
    document.documentElement.classList.add('passes-expecting')
    render(<PassesApp loadElements={loadElements} clock={clock} storage={memoryStorage()} search="?city=atlantis-xx" geolocation={null} fetcher={fetcher} />)
    await screen.findByText(/not one we know/)
    expect(document.documentElement.classList.contains('passes-expecting')).toBe(false)
  })

  it('works with storage blocked', async () => {
    render(
      <PassesApp loadElements={loadElements} clock={clock} storage={null} search="?city=paris-fr" geolocation={null} fetcher={fetcher} />,
    )
    await screen.findByText('Paris, France')
  })

  it('falls back to the search box when location is refused', async () => {
    const geolocation = {
      getCurrentPosition: (_: PositionCallback, fail?: PositionErrorCallback | null) =>
        fail?.({ code: 1 } as GeolocationPositionError),
    } as Geolocation
    render(
      <PassesApp loadElements={loadElements} clock={clock} storage={memoryStorage()} search="" geolocation={geolocation} fetcher={fetcher} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Use my location/ }))
    await waitFor(() => screen.getByText(/type a city instead/))
    expect(screen.getByRole('combobox')).toBeTruthy()
  })
})
