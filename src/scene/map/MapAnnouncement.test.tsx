// @vitest-environment jsdom
/**
 * Tests for the map's spoken description.
 *
 * This is the one part of the map nobody sighted will ever check, which is exactly why it needs
 * pinning: a wrong hemisphere or a stale sentence would go unnoticed indefinitely. The wording is
 * asserted too, because "43.4 degrees north" and "43.4 N" are not the same thing out loud.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MapAnnouncement } from './MapAnnouncement'
import { useOrbitStore } from '../../orbit/useOrbit'
import { useObserverStore } from '../../orbit/observer'
import type { OrbitState } from '../../orbit/propagator'

/** Only the fields the description reads; the rest of OrbitState never reaches it. */
function stateAt(latitude: number, longitude: number, shadow = 0): OrbitState {
  return {
    date: new Date('2026-07-30T12:00:00Z'),
    latitude,
    longitude,
    altitude: 420,
    speed: 7.66,
    eci: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    gmst: 0,
    periodMinutes: 92.96,
    footprintKm: 2290,
    shadow,
  }
}

afterEach(() => {
  cleanup()
  useOrbitStore.setState({ state: null })
  useObserverStore.getState().setObserver(null)
  vi.useRealTimers()
})

describe('MapAnnouncement', () => {
  it('is announced politely, and hidden from the page', () => {
    // `display: none` would take it out of the accessibility tree as well — the opposite of the
    // point — so the class matters as much as the aria attribute.
    useOrbitStore.setState({ state: stateAt(0, 0) })
    const { container } = render(<MapAnnouncement />)
    const region = container.firstElementChild!
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.className).toBe('visually-hidden')
  })

  it('spells the hemispheres out in words', () => {
    // A screen reader reads "43.4° N" as "43.4 N", which is not a latitude.
    useOrbitStore.setState({ state: stateAt(43.4, -81.8) })
    render(<MapAnnouncement />)
    expect(screen.getByText(/43.4 degrees north/)).toBeTruthy()
    expect(screen.getByText(/81.8 degrees west/)).toBeTruthy()
  })

  it('gets the southern and eastern hemispheres right', () => {
    useOrbitStore.setState({ state: stateAt(-33.9, 151.2) })
    render(<MapAnnouncement />)
    expect(screen.getByText(/33.9 degrees south/)).toBeTruthy()
    expect(screen.getByText(/151.2 degrees east/)).toBeTruthy()
  })

  it('names what the station is over', () => {
    // Central Australia, far from any coast, so the lookup cannot be ambiguous.
    useOrbitStore.setState({ state: stateAt(-25, 133) })
    render(<MapAnnouncement />)
    expect(screen.getByText(/over Australia/)).toBeTruthy()
  })

  it('says sunlight or shadow, for the station and not the ground', () => {
    useOrbitStore.setState({ state: stateAt(0, 0, 0.1) })
    const { unmount } = render(<MapAnnouncement />)
    expect(screen.getByText(/in sunlight/)).toBeTruthy()
    unmount()

    useOrbitStore.setState({ state: stateAt(0, 0, 0.9) })
    render(<MapAnnouncement />)
    expect(screen.getByText(/shadow/)).toBeTruthy()
  })

  it('reports the observer only when one has been set', () => {
    useOrbitStore.setState({ state: stateAt(0, 0) })
    const { unmount } = render(<MapAnnouncement />)
    expect(screen.queryByText(/your location/)).toBeNull()
    unmount()

    // Directly beneath the station, so it is unambiguously above the horizon.
    useObserverStore.getState().setObserver({ latitude: 0, longitude: 0 })
    render(<MapAnnouncement />)
    expect(screen.getByText(/above the horizon from your location/)).toBeTruthy()
  })

  it('says below the horizon from the far side of the world', () => {
    useOrbitStore.setState({ state: stateAt(0, 0) })
    useObserverStore.getState().setObserver({ latitude: 0, longitude: 180 })
    render(<MapAnnouncement />)
    expect(screen.getByText(/below the horizon from your location/)).toBeTruthy()
  })

  it('says something sensible before any orbit has been computed', () => {
    useOrbitStore.setState({ state: null })
    render(<MapAnnouncement />)
    expect(screen.getByText(/Waiting for orbital elements/)).toBeTruthy()
  })

  it('speaks as soon as the first orbit is computed, not thirty seconds later', async () => {
    // The component mounts before the elements have loaded. Leaving "waiting" up for a full cycle
    // after the answer arrived would be the whole feature failing at the only moment it is new.
    vi.useFakeTimers()
    useOrbitStore.setState({ state: null })
    render(<MapAnnouncement />)
    expect(screen.getByText(/Waiting for orbital elements/)).toBeTruthy()

    await act(async () => {
      useOrbitStore.setState({ state: stateAt(5, 5) })
    })
    expect(screen.getByText(/5.0 degrees north/)).toBeTruthy()
  })

  it('refreshes on a timer rather than on every position update', async () => {
    // The position changes once a second. A polite region fed at that rate talks over itself and
    // buries the rest of the page.
    vi.useFakeTimers()
    useOrbitStore.setState({ state: stateAt(10, 10) })
    render(<MapAnnouncement />)
    expect(screen.getByText(/10.0 degrees north/)).toBeTruthy()

    useOrbitStore.setState({ state: stateAt(20, 20) })
    expect(screen.getByText(/10.0 degrees north/)).toBeTruthy()

    // Wrapped in `act`: the interval sets state outside React's own flushing, and without this
    // the re-render simply has not happened when the assertion runs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(screen.getByText(/20.0 degrees north/)).toBeTruthy()
  })
})
