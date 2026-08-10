// @vitest-environment jsdom
/**
 * The orbital engine, which is the one thing here that keeps running when NASA does not.
 *
 * It was rewritten the day a reader found a page showing the station over the Indian Ocean while it
 * was over Saudi Arabia. Nothing was wrong with the propagator or the place lookup — both were
 * checked against the sky — the page had simply gone on showing the last position it computed
 * before the browser froze the timers of a tab nobody was watching. What it lacked was a catch-up
 * on the way back.
 *
 * Two things are held down here, and the second is why this file exists at all: the first version
 * of that catch-up refetched the elements on every tab return and every minute, because it asked
 * how old their *epoch* was rather than how long we had held them. Celestrak hands over a set
 * several hours old as a matter of course, so the guard never fired.
 *
 * No network: fetch is refused, so `loadOrbitalElements` falls back to the elements built into the
 * module. They are dated 28/07/2026 — twelve days before the clock this test pins — which is
 * exactly the case that broke the first version.
 */
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useOrbitStore, useOrbitEngine } from './useOrbit'

const NOW = new Date('2026-08-09T12:00:00Z')

/** Mounts the engine and nothing else. */
function Engine() {
  useOrbitEngine()
  return null
}

let visibility: DocumentVisibilityState = 'visible'
let fetches = 0

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  useOrbitStore.setState({ elements: null, state: null, track: [], beta: null, subsolar: null })

  vi.spyOn(console, 'warn').mockImplementation(() => {})
  fetches = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    fetches += 1
    return Promise.reject(new TypeError('offline on purpose'))
  })

  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Lets the element load settle without advancing the clock. */
async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('the orbital engine', () => {
  it('propagates a position as soon as it has elements', async () => {
    render(<Engine />)
    await settle()

    const { state, elements, track } = useOrbitStore.getState()
    expect(elements?.source).toBe('secours')
    expect(state).not.toBeNull()
    expect(Math.abs(state!.latitude)).toBeLessThanOrEqual(52)
    // The track is the map's whole content; an empty one draws nothing at all.
    expect(track.length).toBeGreaterThan(10)
  })

  it('keeps propagating on its own', async () => {
    render(<Engine />)
    await settle()
    const first = useOrbitStore.getState().state!.date.getTime()

    await act(async () => {
      vi.advanceTimersByTime(3_000)
    })
    expect(useOrbitStore.getState().state!.date.getTime()).toBeGreaterThan(first)
  })

  it('catches up the moment the tab comes back, without waiting for the next tick', async () => {
    render(<Engine />)
    await settle()

    // Hidden: whatever the browser does to the timers, nothing here should recompute.
    visibility = 'hidden'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const whileHidden = useOrbitStore.getState().state!.date.getTime()

    // Time passes as it would behind a frozen tab, then the reader looks again.
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000))
    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Recomputed on the event itself — no timer was advanced between these two lines.
    expect(useOrbitStore.getState().state!.date.getTime()).toBeGreaterThan(whileHidden + 9 * 60_000)
  })

  it('stays quiet while the tab is hidden', async () => {
    render(<Engine />)
    await settle()
    const before = useOrbitStore.getState().state!.date.getTime()

    visibility = 'hidden'
    vi.setSystemTime(new Date(NOW.getTime() + 5 * 60_000))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(useOrbitStore.getState().state!.date.getTime()).toBe(before)
  })

  it('does not refetch elements it has only just taken delivery of', async () => {
    render(<Engine />)
    await settle()
    const afterLoad = fetches
    expect(afterLoad).toBeGreaterThan(0)

    /*
     * The bug this test was written for. These fallback elements carry an epoch twelve days old, so
     * a guard reading the epoch treats them as stale for ever and refetches on every tab return and
     * every minute. The guard has to read how long *we* have held them.
     */
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000)
    })

    expect(fetches).toBe(afterLoad)
  })

  it('refetches once they have been held longer than the cache would serve them', async () => {
    render(<Engine />)
    await settle()
    const afterLoad = fetches

    // Past the six hours the cache is willing to serve.
    await act(async () => {
      vi.advanceTimersByTime(6 * 3_600_000 + 60_000)
    })
    await settle()

    expect(fetches).toBeGreaterThan(afterLoad)
  })

  it('stops everything when unmounted', async () => {
    const view = render(<Engine />)
    await settle()
    const before = useOrbitStore.getState().state!.date.getTime()

    view.unmount()
    vi.setSystemTime(new Date(NOW.getTime() + 60_000))
    await act(async () => {
      vi.advanceTimersByTime(5_000)
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // A listener left behind would keep writing to the store for the life of the page.
    expect(useOrbitStore.getState().state!.date.getTime()).toBe(before)
  })
})
