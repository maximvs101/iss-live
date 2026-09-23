/**
 * The home page's live part: where the station is, its track, whether NASA is broadcasting, and
 * the next pass for the visitor's city. Everything else on the page is HTML that reads without it.
 *
 * The heading's position line lives outside this root — it is the page's h1, and its fallback text
 * is what a crawler reads — so it is written straight into #home-where rather than rendered here.
 */
import { useEffect, useMemo, useState } from 'react'
import { groundTrack, propagateIss } from '../orbit/propagator.ts'
import { elementsAgeHours, loadOrbitalElements, type OrbitalElements } from '../orbit/tle.ts'
import { MAX_ELEMENTS_AGE_HOURS } from '../passes/findPasses.ts'
import type { Fetcher } from '../passes/cities.ts'
import { safeStorage } from '../passes/place.ts'
import { HomeMap } from './HomeMap.tsx'
import { nextPassLine, nextVisible, type NextPass } from './nextPass.ts'
import { motionLine, positionLine } from './position.ts'
import { fetchStatus, statusLine, type BroadcastStatus } from './status.ts'

type PlaceNames = (latitude: number, longitude: number) => string | null

/** The overflight module — countries and marine areas — after the first paint, never in the entry. */
async function loadOverflight(): Promise<PlaceNames> {
  const module = await import('../orbit/overflight.ts')
  await module.marineReady
  return (latitude, longitude) => {
    const found = module.overflightAt(latitude, longitude)
    return found ? module.overflightLabel(found) : null
  }
}

// Module-level so the effect that calls it does not rerun on every render: a default written as
// `() => fetchStatus()` in the parameter list is a new function each time, and a new dependency.
const defaultStatus = () => fetchStatus()

export interface HomeAppProps {
  loadElements?: () => Promise<OrbitalElements>
  clock?: () => number
  storage?: Storage | null
  loadPlaceNames?: () => Promise<PlaceNames>
  loadStatus?: () => Promise<BroadcastStatus | null>
  fetcher?: Fetcher
}

export function HomeApp({
  loadElements = loadOrbitalElements,
  clock = Date.now,
  storage = safeStorage(),
  loadPlaceNames = loadOverflight,
  loadStatus = defaultStatus,
  fetcher,
}: HomeAppProps) {
  const [elements, setElements] = useState<OrbitalElements | null>(null)
  const [now, setNow] = useState(clock)
  const [names, setNames] = useState<PlaceNames | null>(null)
  const [broadcast, setBroadcast] = useState<BroadcastStatus | null>(null)
  const [next, setNext] = useState<NextPass | null>(null)

  useEffect(() => {
    let live = true
    loadElements().then((loaded) => {
      if (live) setElements(loaded)
    })
    loadPlaceNames().then(
      (lookup) => {
        if (live) setNames(() => lookup)
      },
      () => {
        // No names: the coordinates stay, which is the same fact said less kindly.
      },
    )
    loadStatus().then((status) => {
      if (live) setBroadcast(status)
    })
    const timer = setInterval(() => setNow(clock()), 5_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [loadElements, loadPlaceNames, loadStatus, clock])

  useEffect(() => {
    if (!elements) return
    let live = true
    nextVisible(storage, elements, clock(), fetcher).then((found) => {
      if (live) setNext(found)
    })
    return () => {
      live = false
    }
  }, [elements, storage, fetcher, clock])

  /*
   * The same age rule as /passes/. The built-in elements date from late July: on a first visit with
   * Celestrak unreachable, two months on, the heading gave an exact-looking position that was wrong
   * by thousands of kilometres. Past fourteen days the station is not placed at all; from three,
   * the age is stated beside the position.
   */
  const ageHours = elements ? elementsAgeHours(elements, now) : null
  const tooOld = ageHours !== null && ageHours > MAX_ELEMENTS_AGE_HOURS
  const current = elements && !tooOld ? elements : null
  const state = current ? propagateIss(current.satrec, new Date(now)) : null
  const minute = Math.floor(now / 60_000)
  const track = useMemo(
    () => (current ? groundTrack(current.satrec, new Date(minute * 60_000), -45, 90, 60) : []),
    [current, minute],
  )
  const days = ageHours === null ? 0 : Math.round(ageHours / 24)
  const place =
    state && names ? names(Math.round(state.latitude * 10) / 10, Math.round(state.longitude * 10) / 10) : null
  const line = state ? positionLine(state, place) : null

  useEffect(() => {
    const heading = document.getElementById('home-where')
    if (heading && line) heading.textContent = line
  }, [line])

  return (
    <>
      <p className="home__motion">
        {tooOld
          ? `The orbital elements in hand are ${days} days old — too old to place the station.`
          : state
            ? motionLine(state) + (ageHours !== null && ageHours > 72 ? ` · orbital elements ${days} days old` : '')
            : ' '}
        {broadcast && (
          <span className={broadcast.live ? 'home__nasa home__nasa--live' : 'home__nasa'}> · {statusLine(broadcast)}</span>
        )}
      </p>
      <HomeMap track={track} position={state} label={line ?? 'The station’s position is being computed.'} now={now} />
      <p className="home__next">{next && <a href="/passes/">{nextPassLine(next, now)}</a>}</p>
    </>
  )
}
