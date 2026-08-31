// @vitest-environment jsdom
/**
 * The map, checked at its seam with the projection rather than on its looks.
 *
 * `projection.ts` is well tested and `MapView` was not tested at all, which leaves the interesting
 * failure uncovered: not whether latitude becomes y correctly — that is settled — but whether the
 * view *uses* that answer for the things it draws. A marker placed by a second, hand-rolled
 * conversion would agree with the first often enough to look right and be wrong at the edges.
 *
 * So the assertions here compare what the component put in the DOM against what the projection
 * says, for the same numbers. Two independent statements of one fact is precisely the arrangement
 * this project has been bitten by before.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useOrbitStore } from '../../orbit/useOrbit'
import { useObserverStore } from '../../orbit/observer'
import { latToY, lonToX } from './projection'
import { MapView } from './MapView'

/*
 * jsdom has no `ResizeObserver`, and the map now asks for one: it measures the box it was given so
 * it can size its labels in screen pixels rather than in map units. A stub is enough — jsdom lays
 * nothing out, so the width would be 0 whatever this returned, and the component falls back to a
 * scale of 1. What it must not do is throw, which is what an unstubbed constructor did to all four
 * of these tests.
 */
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const AT = new Date('2026-08-09T19:00:00Z')

/** A station over the Indian Ocean, with a track running the width of the map. */
const STATION = {
  date: AT,
  latitude: -17.5,
  longitude: 63.8,
  altitude: 421.7,
  speed: 7.66,
  eci: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  footprintKm: 2257,
  shadow: 0,
}

const TRACK = Array.from({ length: 40 }, (_, i) => ({
  latitude: -50 + i * 2.5,
  longitude: -170 + i * 8,
  date: new Date(AT.getTime() + i * 60_000),
  shadow: 0,
}))

beforeEach(() => {
  useOrbitStore.setState({
    state: STATION as never,
    track: TRACK as never,
    beta: -34.5,
    subsolar: { latitude: 15.7, longitude: -74.8 },
  } as never)
  useObserverStore.setState({ observer: null, status: 'idle' })
})

afterEach(cleanup)

describe('the map', () => {
  it('draws the coastlines, the track and a marker', () => {
    render(<MapView />)
    const svg = document.querySelector('svg')
    expect(svg).not.toBeNull()
    // The world outline is the bulk of it; without it the map is an empty rectangle.
    expect(svg!.querySelectorAll('path').length).toBeGreaterThan(50)
  })

  it('puts the station where the projection says, not where a second conversion does', () => {
    const { width, height } = { width: 1000, height: 500 }
    render(<MapView />)

    const svg = document.querySelector('svg')!
    const viewBox = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number)
    const size = viewBox.length === 4 ? { width: viewBox[2], height: viewBox[3] } : { width, height }

    const expectedX = lonToX(STATION.longitude, size)
    const expectedY = latToY(STATION.latitude, size)

    /*
     * The station silhouette is a group carrying `translate(x y) rotate(...)`, not a circle — the
     * first version of this looked for circles, found the observer and footprint markers instead,
     * and reported the station 281 px out.
     */
    const placed = [...svg.querySelectorAll('g[transform]')]
      .map((g) => /translate\(\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)\s*\)/.exec(g.getAttribute('transform') ?? ''))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
    expect(placed.length).toBeGreaterThan(0)

    const nearest = placed.reduce((best, c) =>
      Math.hypot(c.x - expectedX, c.y - expectedY) < Math.hypot(best.x - expectedX, best.y - expectedY)
        ? c
        : best,
    )
    expect(Math.abs(nearest.x - expectedX)).toBeLessThan(1)
    expect(Math.abs(nearest.y - expectedY)).toBeLessThan(1)
  })

  it('announces where the station is for a reader who cannot see the map', () => {
    render(<MapView />)
    const live = document.querySelector('[aria-live]')
    expect(live).not.toBeNull()
    expect(live!.textContent?.length).toBeGreaterThan(0)
  })

  it('draws nothing rather than NaN before the first orbit state arrives', () => {
    // The first paint happens before Celestrak has answered. Coordinates computed from null would
    // reach the DOM as "NaN" and silently blank the map.
    useOrbitStore.setState({ state: null, track: [] } as never)
    render(<MapView />)
    expect(document.body.innerHTML).not.toContain('NaN')
  })
})
