/**
 * The pass finder on /passes/: a place, the station's orbit, and five days of passes.
 *
 * Everything around it on the page is plain HTML that reads without this; this is the part that
 * needs a clock and the orbital elements. It recomputes once a minute so that a page left open
 * drops the passes that have gone by.
 */
import { useEffect, useMemo, useState } from 'react'
import { elementsAgeHours, loadOrbitalElements, type OrbitalElements } from '../orbit/tle.ts'
import type { Fetcher } from './cities.ts'
import { findPasses, positionFrom } from './findPasses.ts'
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

export interface PassesAppProps {
  loadElements?: () => Promise<OrbitalElements>
  clock?: () => number
  storage?: Storage | null
  search?: string
  geolocation?: Geolocation | null
  fetcher?: Fetcher
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
    resolveChoice(choice, fetcher).then((resolved) => {
      if (!live) return
      if (resolved) setPlace(resolved)
      else if (choice.source === 'url') setNotice('That city link is not one we know. Search for the city instead.')
    })
    return () => {
      live = false
    }
  }, [search, storage, fetcher])

  const passes = useMemo(
    () =>
      elements && place
        ? findPasses(positionFrom(elements.satrec), place.kind === 'city' ? place.city : place, new Date(now))
        : null,
    [elements, place, now],
  )

  const choose = (next: Place) => {
    setPlace(next)
    setNotice(null)
    setShared(false)
    writeStored(toStored(next), storage)
  }

  const forget = () => {
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

  const age = elements ? elementsAgeHours(elements, now) : null
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
