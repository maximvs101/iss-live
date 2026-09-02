/**
 * The application's orbital engine: loads the elements, propagates the position continuously and
 * maintains the ground track.
 *
 * Independent of the telemetry stream: this part works even when NASA broadcasts nothing.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { loadOrbitalElements, type OrbitalElements } from './tle'
import {
  betaAngle,
  groundTrack,
  propagateIss,
  subsolarPoint,
  type GroundTrackPoint,
  type OrbitState,
} from './propagator'

/** Position update rate. */
const TICK_MS = 1000
const TRACK_REFRESH_MS = 60_000

/**
 * How old the orbital elements may get before they are fetched again.
 *
 * They were loaded once, at mount, and never again — which is invisible on a page reloaded every
 * few minutes and quietly wrong on one left open. Celestrak publishes several times a day and the
 * position drifts by a few kilometres per day of element age, so six hours matches the cache in
 * `tle` and asks the server no more often than it has something new to say.
 */
const ELEMENTS_MAX_AGE_MS = 6 * 3_600_000

/**
 * The ground track: three quarters of an orbit behind, a full one ahead.
 *
 * Not symmetric, because the two halves answer different questions. Behind is context — where the
 * station has just been — and 45 minutes of it is plenty. Ahead is the useful half: at 92.96
 * minutes per revolution, 90 minutes forward draws very nearly the whole of the next orbit, so the
 * track runs on until it almost meets its own starting point one revolution west.
 */
const TRACK_FROM_MINUTES = -45
const TRACK_TO_MINUTES = 90

interface OrbitStore {
  elements: OrbitalElements | null
  state: OrbitState | null
  track: GroundTrackPoint[]
  /** Computed beta angle, in degrees. */
  beta: number | null
  subsolar: { latitude: number; longitude: number } | null
  error: string | null

  setElements: (elements: OrbitalElements) => void
  setState: (
    state: OrbitState,
    beta: number,
    subsolar: { latitude: number; longitude: number },
  ) => void
  setTrack: (track: GroundTrackPoint[]) => void
  setError: (error: string) => void
}

export const useOrbitStore = create<OrbitStore>((set) => ({
  elements: null,
  state: null,
  track: [],
  beta: null,
  subsolar: null,
  error: null,

  setElements: (elements) => set({ elements, error: null }),
  setState: (state, beta, subsolar) => set({ state, beta, subsolar }),
  setTrack: (track) => set({ track }),
  setError: (error) => set({ error }),
}))

/**
 * Starts the orbital engine. Mount once, at the root of the application.
 */
export function useOrbitEngine(): void {
  useEffect(() => {
    let cancelled = false
    let tickTimer: ReturnType<typeof setInterval> | null = null
    let trackTimer: ReturnType<typeof setInterval> | null = null
    /** Replaced when the elements are refreshed, so the timers below always read the current set. */
    let elements: OrbitalElements | null = null
    /** When we last took delivery of them — not their epoch, which is older on arrival. */
    let fetchedAt = 0

    const tick = () => {
      if (!elements) return
      const now = new Date()
      const state = propagateIss(elements.satrec, now)
      if (!state) {
        useOrbitStore.getState().setError('Orbit propagation failed.')
        return
      }
      useOrbitStore.getState().setState(state, betaAngle(state, now), subsolarPoint(now))
    }

    const refreshTrack = () => {
      if (!elements) return
      useOrbitStore
        .getState()
        .setTrack(groundTrack(elements.satrec, new Date(), TRACK_FROM_MINUTES, TRACK_TO_MINUTES, 30))
    }

    /**
     * Fetches the elements again once ours have been in hand longer than the cache would serve them.
     *
     * Measured from when we fetched, not from the elements' own epoch. The first version of this
     * compared `elementsAgeHours`, which is the age of the *epoch* — and Celestrak routinely hands
     * over a set several hours old, while the built-in fallback is dated whenever it was pasted in.
     * The condition was therefore almost never satisfied, so this ran on every tab return and every
     * minute: harmless against a warm cache, a failed network request a minute against a cold one,
     * and a re-render of everything watching `elements` either way.
     */
    const refreshElements = async () => {
      if (elements && Date.now() - fetchedAt < ELEMENTS_MAX_AGE_MS) return
      const fresh = await loadOrbitalElements()
      if (cancelled) return
      elements = fresh
      fetchedAt = Date.now()
      useOrbitStore.getState().setElements(fresh)
    }

    /*
     * Catch up the moment the tab is looked at again.
     *
     * Reported from use: a page left open showed the station over the Indian Ocean while it was
     * over Saudi Arabia, and the age of the telemetry appeared frozen. Nothing was broken — the
     * browser had been throttling and then freezing the timers of a tab nobody was watching, which
     * is what browsers are supposed to do. What was missing is the other half: on coming back, the
     * page went on showing the last position it had computed until the next tick came round, and a
     * frozen tab does not necessarily resume one promptly.
     *
     * A tick costs a propagation — well under a millisecond — so there is nothing to weigh here.
     * The elements are checked at the same moment, because a tab open for days is exactly the one
     * whose orbital elements have gone stale, and nothing else would ever have refetched them.
     */
    const catchUp = () => {
      if (document.visibilityState !== 'visible') return
      tick()
      refreshTrack()
      void refreshElements().then(tick)
    }

    const start = async () => {
      await refreshElements()
      if (cancelled) return

      tick()
      refreshTrack()
      tickTimer = setInterval(tick, TICK_MS)
      trackTimer = setInterval(() => {
        refreshTrack()
        void refreshElements()
      }, TRACK_REFRESH_MS)
    }

    void start()
    document.addEventListener('visibilitychange', catchUp)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', catchUp)
      if (tickTimer) clearInterval(tickTimer)
      if (trackTimer) clearInterval(trackTimer)
    }
  }, [])
}

