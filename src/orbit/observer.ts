/**
 * The place passes are computed for.
 *
 * Kept in local storage so it survives a reload: a user who has entered their coordinates once
 * should not have to do it again. Nothing is sent anywhere — the whole calculation runs in the
 * browser, and the position never leaves it.
 */
import { create } from 'zustand'
import type { Observer } from './passes'

const STORAGE_KEY = 'iss-live.observer'

function readStored(): Observer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Observer
    if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function store(observer: Observer | null): void {
  try {
    if (observer) localStorage.setItem(STORAGE_KEY, JSON.stringify(observer))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private browsing, quota): the position simply will not persist.
  }
}

type LocationStatus = 'idle' | 'locating' | 'denied' | 'unavailable'

interface ObserverStore {
  observer: Observer | null
  status: LocationStatus
  setObserver: (observer: Observer | null) => void
  locate: () => void
}

export const useObserverStore = create<ObserverStore>((set) => ({
  observer: readStored(),
  status: 'idle',

  setObserver: (observer) => {
    store(observer)
    set({ observer, status: 'idle' })
  },

  locate: () => {
    if (!navigator.geolocation) {
      set({ status: 'unavailable' })
      return
    }
    set({ status: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const observer: Observer = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitudeM: position.coords.altitude ?? 0,
          label: 'My location',
        }
        store(observer)
        set({ observer, status: 'idle' })
      },
      (error) => {
        set({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' })
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  },
}))
