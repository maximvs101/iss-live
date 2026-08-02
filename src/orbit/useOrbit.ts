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

    const start = async () => {
      const elements = await loadOrbitalElements()
      if (cancelled) return
      useOrbitStore.getState().setElements(elements)

      const tick = () => {
        const now = new Date()
        const state = propagateIss(elements.satrec, now)
        if (!state) {
          useOrbitStore.getState().setError('Orbit propagation failed.')
          return
        }
        useOrbitStore.getState().setState(state, betaAngle(state, now), subsolarPoint(now))
      }

      const refreshTrack = () => {
        useOrbitStore
          .getState()
          .setTrack(
            groundTrack(elements.satrec, new Date(), TRACK_FROM_MINUTES, TRACK_TO_MINUTES, 30),
          )
      }

      tick()
      refreshTrack()
      tickTimer = setInterval(tick, TICK_MS)
      trackTimer = setInterval(refreshTrack, TRACK_REFRESH_MS)
    }

    void start()

    return () => {
      cancelled = true
      if (tickTimer) clearInterval(tickTimer)
      if (trackTimer) clearInterval(trackTimer)
    }
  }, [])
}

