// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { twoline2satrec } from 'satellite.js'
import { HomeApp } from './HomeApp.tsx'
import { clearCityCache } from '../passes/cities.ts'
import type { OrbitalElements } from '../orbit/tle.ts'

const elements: OrbitalElements = {
  satrec: twoline2satrec(
    '1 25544U 98067A   26209.15252568  .00016717  00000+0  30074-3 0  9993',
    '2 25544  51.6393 210.5107 0002140 106.5723 253.5556 15.50022337 12345',
  ),
  epoch: new Date('2026-07-28T03:39:38Z'),
  source: 'reseau',
  objectName: 'ISS (ZARYA)',
}
const clock = () => Date.parse('2026-07-28T00:00:00Z')
const loadElements = async () => elements
const empty = { getItem: () => null } as unknown as Storage
const noNames = async () => () => null
const noStatus = async () => null

beforeEach(() => {
  document.body.innerHTML = '<span id="home-where">somewhere over the Earth, about 420 km up.</span>'
})
afterEach(() => {
  cleanup()
  clearCityCache()
})

describe('HomeApp', () => {
  it('writes the position into the heading, coordinates first, then the place name', async () => {
    let ready: () => void = () => {}
    const loadPlaceNames = () =>
      new Promise<(lat: number, lon: number) => string | null>((resolve) => (ready = () => resolve(() => 'the Coral Sea')))
    render(<HomeApp loadElements={loadElements} clock={clock} storage={empty} loadPlaceNames={loadPlaceNames} loadStatus={noStatus} />)
    const where = document.getElementById('home-where')!
    await waitFor(() => expect(where.textContent).toMatch(/^Over \d+\.\d° [NS], \d+\.\d° [EW], \d+ km up\.$/))
    ready()
    await waitFor(() => expect(where.textContent).toMatch(/^Over the Coral Sea, \d+ km up\.$/))
  })

  // Review focus 3
  it('keeps the coordinates when the place names cannot load', async () => {
    render(
      <HomeApp
        loadElements={loadElements}
        clock={clock}
        storage={empty}
        loadPlaceNames={() => Promise.reject(new Error('offline'))}
        loadStatus={noStatus}
      />,
    )
    const where = document.getElementById('home-where')!
    await waitFor(() => expect(where.textContent).toMatch(/^Over \d+\.\d° [NS]/))
  })

  it('draws the map and says whether NASA is broadcasting, or leaves that out', async () => {
    const { container, unmount } = render(
      <HomeApp
        loadElements={loadElements}
        clock={clock}
        storage={empty}
        loadPlaceNames={noNames}
        loadStatus={async () => ({ live: false, lastLive: '2026-07-20T10:00:00Z' })}
      />,
    )
    await screen.findByText(/NASA’s broadcast silent since 20 Jul/)
    expect(container.querySelector('.home-map__station')).not.toBeNull()
    unmount()
    render(<HomeApp loadElements={loadElements} clock={clock} storage={empty} loadPlaceNames={noNames} loadStatus={noStatus} />)
    await screen.findByText(/km\/h/)
    expect(screen.queryByText(/NASA’s broadcast/)).toBeNull()
  })

  it('offers /passes/ when no city is remembered', async () => {
    render(<HomeApp loadElements={loadElements} clock={clock} storage={empty} loadPlaceNames={noNames} loadStatus={noStatus} />)
    const link = await screen.findByRole('link', { name: 'When can you see it from your city?' })
    expect(link.getAttribute('href')).toBe('/passes/')
  })
})
