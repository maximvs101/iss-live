/**
 * The pass finder on /passes/: a place, the station's orbit, and five days of passes.
 *
 * Everything around it on the page is plain HTML that reads without this; this is the part that
 * needs a clock and the orbital elements. It recomputes once a minute so that a page left open
 * drops the passes that have gone by.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { elementsAgeHours, loadOrbitalElements, type OrbitalElements } from '../orbit/tle.ts'
import type { Fetcher } from './cities.ts'
import { MAX_ELEMENTS_AGE_HOURS, findPasses, positionFrom } from './findPasses.ts'
import { LocationBar } from './LocationBar.tsx'
import { PassList } from './PassList.tsx'
import {
  initialChoice,
  locate,
  placeLabel,
  placeTimeZone,
  resolveChoice,
  safeStorage,
  shareUrl,
  toStored,
  writeStored,
  type Place,
} from './place.ts'

/*
 * MAX_ELEMENTS_AGE_HOURS, from findPasses.ts, shared with the home page: past it, no times are
 * shown at all. The drift of a set of elements grows with its age, and the
 * built-in set dates from late July: on a first visit with Celestrak unreachable, two months on,
 * it gave minute-precise times under a note that they "can move by minutes". Up to three days the
 * age is shown plainly, from three it is shown in amber, and from fourteen the list gives way.
 */

export interface PassesAppProps {
  loadElements?: () => Promise<OrbitalElements>
  clock?: () => number
  storage?: Storage | null
  search?: string
  geolocation?: Geolocation | null
  fetcher?: Fetcher
}

/*
 * Once the visitor has chosen, the address stops naming the linked city: a link beats memory, so
 * with ?city=paris-fr left in place, a reload after choosing Lyon went straight back to Paris.
 */
function dropCityFromAddress(): void {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('city')) return
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash)
}

function browserGeolocation(): Geolocation | null {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null
}

export function PassesApp({
  loadElements = loadOrbitalElements,
  clock = Date.now,
  storage = safeStorage(),
  search = typeof window === 'undefined' ? '' : window.location.search,
  geolocation = browserGeolocation(),
  fetcher,
}: PassesAppProps) {
  const [elements, setElements] = useState<OrbitalElements | null>(null)
  const [place, setPlace] = useState<Place | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [shared, setShared] = useState(false)
  const [now, setNow] = useState(clock)
  // A place is on its way — from the link or from memory — and the page should not know it yet.
  const [awaiting, setAwaiting] = useState(() => initialChoice(search, storage) !== null)
  // Set when the visitor picks or clears a place: a linked or remembered one still loading must not
  // land on top of that choice afterwards.
  const decided = useRef(false)

  useEffect(() => {
    let live = true
    loadElements().then((loaded) => {
      if (live) setElements(loaded)
    })
    return () => {
      live = false
    }
  }, [loadElements])

  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), 60_000)
    return () => clearInterval(timer)
  }, [clock])

  useEffect(() => {
    let live = true
    const choice = initialChoice(search, storage)
    if (!choice) return
    resolveChoice(choice, fetcher).then(
      (resolved) => {
        if (!live || decided.current) return
        setAwaiting(false)
        if (resolved) setPlace(resolved)
        else if (choice.source === 'url') setNotice('That city link is not one we know. Search for the city instead.')
      },
      () => {
        if (!live || decided.current) return
        setAwaiting(false)
        setNotice('The city list could not be loaded. Try again in a moment, or use your location.')
      },
    )
    return () => {
      live = false
    }
  }, [search, storage, fetcher])

  const age = elements ? elementsAgeHours(elements, now) : null
  const tooOld = age !== null && age > MAX_ELEMENTS_AGE_HOURS
  const passes = useMemo(
    () =>
      elements && place && !tooOld
        ? findPasses(positionFrom(elements.satrec), place.kind === 'city' ? place.city : place, new Date(now))
        : null,
    [elements, place, now, tooOld],
  )

  const choose = (next: Place) => {
    decided.current = true
    setAwaiting(false)
    dropCityFromAddress()
    setPlace(next)
    setNotice(null)
    setShared(false)
    writeStored(toStored(next), storage)
  }

  const forget = () => {
    decided.current = true
    setAwaiting(false)
    dropCityFromAddress()
    setPlace(null)
    writeStored(null, storage)
  }

  const locateMe = geolocation
    ? () => {
        locate(geolocation).then(choose, () => setNotice('Location unavailable — type a city instead.'))
      }
    : null

  const share = async () => {
    if (place?.kind !== 'city') return
    const url = shareUrl(place.city.slug, window.location.origin)
    try {
      if (navigator.share) await navigator.share({ url, title: `ISS passes over ${place.city.name}` })
      else await navigator.clipboard.writeText(url)
      setShared(true)
    } catch {
      // Dismissed by the visitor: nothing to report.
    }
  }

  /*
   * A screen's height held while a known place and its passes load. Without it the list arrived
   * after the first paint and pushed every paragraph below it down: Lighthouse measured 0.449 of
   * layout shift on /passes/?city=paris-fr. The room has to exist before the first paint, so the
   * page's head claims it with a class on <html>; this lets it go once there is nothing to wait
   * for. The list, once there, is taller than a screen, so letting go moves nothing.
   */
  const pending = awaiting || (place !== null && passes === null && !tooOld)
  useEffect(() => {
    if (!pending) document.documentElement.classList.remove('passes-expecting')
  }, [pending])

  const stale = elements !== null && (elements.source === 'secours' || (age ?? 0) > 72)

  return (
    <>
      {place ? (
        <p className="passes__place">
          <strong>{placeLabel(place)}</strong> · times in {placeTimeZone(place)} ·{' '}
          {place.kind === 'city' ? (
            <button type="button" className="link" onClick={share}>
              {shared ? 'link ready' : 'share'}
            </button>
          ) : (
            <span className="passes__hint">choose a city to share a link</span>
          )}{' '}
          ·{' '}
          <button type="button" className="link" onClick={forget}>
            change
          </button>
        </p>
      ) : (
        <LocationBar onPick={(city) => choose({ kind: 'city', city })} onLocate={locateMe} fetcher={fetcher} />
      )}

      {notice && (
        <p className="passes__notice" role="status">
          {notice}
        </p>
      )}

      {place && !elements && <p className="note">Loading the station’s orbit…</p>}
      {place && passes && <PassList passes={passes} place={place} now={now} />}
      {place && tooOld && (
        <p className="passes__notice" role="status">
          The station’s orbital elements in hand are {Math.round(age! / 24)} days old — too old to give the times of
          passes: the station will be minutes away from where they put it. The current set could not be fetched; try
          again later.
        </p>
      )}

      {elements && age !== null && (
        <p className={stale ? 'passes__age passes__age--stale' : 'passes__age'}>
          Orbital elements {age < 48 ? `${Math.round(age)} h` : `${Math.round(age / 24)} days`} old
          {elements.source === 'secours' ? ' — the built-in set, because the current one could not be fetched' : ''}.
          A reboost not yet published can move a pass by minutes.
        </p>
      )}
    </>
  )
}
