// @vitest-environment jsdom
/**
 * Where the passes are computed for, and the three ways asking the browser can go.
 *
 * Typing coordinates in was tested by hand and works. The button beside it was not: granting
 * permission is one path, refusing it is another, and a browser with no geolocation at all is a
 * third — and a developer who clicks "allow" once never sees the other two again, because the
 * choice is remembered per origin.
 *
 * Each one has to leave a different status behind, since the panel wording depends on it: "denied"
 * asks the reader to type the coordinates instead, and "unavailable" would be a lie if the reader
 * had in fact refused.
 *
 * The position never leaves the browser, which is the reason this store exists rather than a
 * lookup — worth keeping true, and the storage assertions below are what would notice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useObserverStore } from './observer'

const STORAGE_KEY = 'iss-live.observer'
const PARIS = { latitude: 48.8566, longitude: 2.3522, altitudeM: 35 }

/** A geolocation that answers however the test wants it to. */
function geolocation(answer: 'grant' | 'deny' | 'fail') {
  return {
    getCurrentPosition: (ok: PositionCallback, no: PositionErrorCallback) => {
      if (answer === 'grant') {
        ok({ coords: { latitude: 48.8566, longitude: 2.3522, altitude: 35 } } as GeolocationPosition)
      } else {
        no({ code: answer === 'deny' ? 1 : 2, PERMISSION_DENIED: 1 } as GeolocationPositionError)
      }
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  useObserverStore.setState({ observer: null, status: 'idle' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the observer', () => {
  it('remembers a location across a reload, and nothing else', () => {
    useObserverStore.getState().setObserver(PARIS)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(stored).toMatchObject(PARIS)
    // Only the coordinates. Anything else appearing here would be data leaving the page.
    expect(Object.keys(stored).sort()).toEqual(['altitudeM', 'latitude', 'longitude'])
  })

  it('forgets on request', () => {
    useObserverStore.getState().setObserver(PARIS)
    useObserverStore.getState().setObserver(null)

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(useObserverStore.getState().observer).toBeNull()
  })

  it('takes the position when the browser grants it', () => {
    vi.stubGlobal('navigator', { geolocation: geolocation('grant') })
    useObserverStore.getState().locate()

    const { observer, status } = useObserverStore.getState()
    expect(status).toBe('idle')
    expect(observer).toMatchObject({ latitude: 48.8566, longitude: 2.3522, label: 'My location' })
    // Kept, like a typed one: granting once should be enough.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('says denied when the reader refuses, not unavailable', () => {
    // The distinction the panel's wording rests on. Told "unavailable", a reader who has just
    // pressed Block would think the feature broken.
    vi.stubGlobal('navigator', { geolocation: geolocation('deny') })
    useObserverStore.getState().locate()

    expect(useObserverStore.getState().status).toBe('denied')
    expect(useObserverStore.getState().observer).toBeNull()
  })

  it('says unavailable when the attempt fails for any other reason', () => {
    vi.stubGlobal('navigator', { geolocation: geolocation('fail') })
    useObserverStore.getState().locate()
    expect(useObserverStore.getState().status).toBe('unavailable')
  })

  it('says unavailable rather than throwing where there is no geolocation at all', () => {
    vi.stubGlobal('navigator', {})
    useObserverStore.getState().locate()
    expect(useObserverStore.getState().status).toBe('unavailable')
  })

  it('ignores stored rubbish instead of starting up broken', async () => {
    /*
     * Hand-edited storage, a half-written value, a format from an older version: any of them would
     * otherwise reach the propagator as NaN and quietly poison every pass.
     *
     * The store is re-imported rather than reset, because the rubbish is read exactly once, when
     * the module is evaluated. A first version of this called `vi.resetModules()` and then asserted
     * against the store already in scope — which had been built at import time, before the storage
     * was touched, and so proved nothing whatever.
     */
    for (const rubbish of ['{"latitude":"48"}', 'null', 'not json at all', '{}', '{"latitude":48}']) {
      localStorage.setItem(STORAGE_KEY, rubbish)
      vi.resetModules()
      const fresh = await import('./observer')
      expect(fresh.useObserverStore.getState().observer, rubbish).toBeNull()
    }

    // And a well-formed one still comes back, or the guard above would be indistinguishable from
    // never reading storage at all.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(PARIS))
    vi.resetModules()
    const fresh = await import('./observer')
    expect(fresh.useObserverStore.getState().observer).toMatchObject(PARIS)
  })
})
