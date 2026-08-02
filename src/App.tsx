/**
 * ISS Live — an educational digital twin of the International Space Station.
 *
 * The application draws on two independent sources:
 *  - NASA's public telemetry, broadcast through Lightstreamer;
 *  - Celestrak's orbital elements, propagated locally.
 *
 * The second is enough to keep the map alive when the first goes quiet.
 */
import { Suspense, lazy, useEffect, useState } from 'react'
import { connectTelemetry, disconnectTelemetry } from './telemetry/client'
import { useTelemetryStore } from './telemetry/store'
import { LIVE_THRESHOLD_MS, reconnectDecision } from './telemetry/reconnect'
import { streamAgeMs } from './telemetry/health'
import { NowOver } from './ui/NowOver'
import { SUBSCRIBED_PUIS } from './telemetry/subsystems'
import { useOrbitEngine } from './orbit/useOrbit'
import { MapView } from './scene/map/MapView'
import { StreamStatusBar } from './ui/StreamStatusBar'
import { OrbitPanel } from './ui/OrbitPanel'
import { PassesPanel } from './ui/PassesPanel'
import { InspectorPanel } from './ui/InspectorPanel'
import { SubsystemPanel } from './ui/SubsystemPanel'
import { HoverLabel } from './ui/HoverLabel'
import { SpaceWeatherPanel } from './ui/SpaceWeatherPanel'
import { OrbitProfile } from './ui/charts/OrbitProfile'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { SourcesDialog } from './ui/SourcesDialog'
import { useSelectionStore } from './ui/selection'
import { partFromSearch, searchForPart } from './ui/deepLink'
import './App.css'

/**
 * The Station view is loaded on demand.
 *
 * It is the only part of the application that needs three.js and react-three-fiber — some 256 kB
 * gzipped — and the map, which opens first, is plain SVG. Deferring it was impossible while a 3D
 * globe shared the same libraries; removing the globe is what made this worth doing.
 */
const StationView = lazy(() =>
  import('./scene/StationView').then((module) => ({ default: module.StationView })),
)

type ViewId = 'map' | 'station'

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'station', label: 'Station' },
]

/**
 * Hint floated over the scene — for the 3D view only.
 *
 * The map used to carry one too, and it was describing what the legend below it already spells
 * out, in a box that sat on top of that legend once the map stopped being full height. The 3D view
 * has no legend and its controls are not self-evident, so there the hint earns its place.
 */
const STATION_HINT = 'Drag to rotate the station, hover an element to name it, click to inspect it.'

export default function App() {
  // `?part=cupola` opens on the station with that part selected. Read once, synchronously, so the
  // first render is already the right one rather than the map flashing past.
  const [view, setView] = useState<ViewId>(() =>
    partFromSearch(window.location.search) ? 'station' : 'map',
  )
  const selected = useSelectionStore((store) => store.selected)
  const select = useSelectionStore((store) => store.select)

  useOrbitEngine()

  useEffect(() => {
    const part = partFromSearch(window.location.search)
    if (part) select(part)
  }, [select])

  /**
   * Keep the address bar on the current selection, so a link can be copied out as well as followed
   * in. `replaceState`, not `pushState`: clicking through a dozen modules should not bury the page
   * a dozen entries deep in the back button.
   */
  useEffect(() => {
    const search = searchForPart(view === 'station' ? selected : null, window.location.search)
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`)
    }
  }, [selected, view])

  /*
   * The stream, and the watchdog that keeps it.
   *
   * Connecting once and trusting the SDK is what left a tab stranded: reported from use, the
   * telemetry never came back green without a reload, and a reload does the one thing the running
   * page did not — open a fresh session. The policy that decides when to do that lives in
   * telemetry/reconnect, where its two interesting cases can be tested without a network.
   */
  useEffect(() => {
    const open = () => connectTelemetry({ items: SUBSCRIBED_PUIS, maxFrequency: 1 })
    open()

    let attempts = 0
    let lastAttemptAt: number | null = null
    let woke = false

    const evaluate = () => {
      const { connection } = useTelemetryStore.getState()
      const now = Date.now()
      // The same age the indicator shows, from the same function: measured by the station's clock
      // rather than by when the packet landed. A watchdog reading arrival time sees a healthy
      // stream during exactly the failure it exists to repair.
      const ageMs = streamAgeMs(now)

      // A stream that is delivering again clears the backoff, so the next outage starts from the
      // short step rather than from wherever the last one left off.
      if (ageMs !== null && ageMs <= LIVE_THRESHOLD_MS) {
        attempts = 0
        lastAttemptAt = null
      }

      const { reconnect, reason } = reconnectDecision({
        connection,
        ageMs,
        sinceAttemptMs: lastAttemptAt === null ? null : now - lastAttemptAt,
        attempts,
        online: navigator.onLine,
        visible: document.visibilityState === 'visible',
        woke,
      })
      woke = false
      if (!reconnect) return

      console.info(`[telemetry] re-establishing: ${reason}`)
      attempts += 1
      lastAttemptAt = now
      open()
    }

    const timer = setInterval(evaluate, 5_000)
    const onWake = () => {
      woke = true
      evaluate()
    }
    window.addEventListener('online', onWake)
    document.addEventListener('visibilitychange', onWake)

    return () => {
      clearInterval(timer)
      window.removeEventListener('online', onWake)
      document.removeEventListener('visibilitychange', onWake)
      disconnectTelemetry()
    }
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <h1>ISS Live</h1>
          <p>Digital twin of the International Space Station</p>
        </div>

        {/* Moved up from the orbital panel: it is the one line on the page that reads without any
            other context, and the panel it used to live in is only on screen in one of the views. */}
        <NowOver />

        {/* Stream health sits in the header rather than at the top of the side panel: it applies
            to everything on screen, and it is the first thing worth knowing. */}
        <StreamStatusBar />

        {/* One reading level, not three. Discovery and Education were the same numbers with the
            identifiers hidden and a paragraph added, and neither earned its switch: the
            explanations belong beside the values, which is where they now live. */}
        <div className="app__controls">
          <nav className="view-switch" aria-label="View">
            {VIEWS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`view-switch__item${view === entry.id ? ' view-switch__item--active' : ''}`}
                onClick={() => setView(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          {/* Last in the header and styled as a plain link: findable, never in the way. */}
          <SourcesDialog />
        </div>
      </header>

      <main className="app__main">
        {/*
          The scene keeps the top of the column and the telemetry takes the rest.

          The map is locked to 2:1, so in a full-height column it left 560 px of its 1196 empty —
          nearly half the largest area on screen, showing nothing. Meanwhile the telemetry sat last
          in a 400 px column behind 1196 px of other panels: exactly one screenful, so the readings
          this application exists to show began precisely where the viewport ended. They now open
          in the widest space available, and the panels that give them context keep the side.
        */}
        <div className={`app__primary app__primary--${view}`}>
          <div className="app__scene">
            <ErrorBoundary>
              {view === 'map' ? (
                <MapView />
              ) : (
                <Suspense fallback={<p className="scene__loading">Loading the 3D view…</p>}>
                  <StationView />
                </Suspense>
              )}
            </ErrorBoundary>

            {view === 'station' && (
              <>
                <p className="scene__hint">{STATION_HINT}</p>
                <HoverLabel />
              </>
            )}
          </div>

          <ErrorBoundary>
            <SubsystemPanel />
          </ErrorBoundary>
        </div>

        <aside className="app__side">
          {view === 'station' ? <InspectorPanel /> : <OrbitPanel />}
          {view === 'map' && <PassesPanel />}
          <SpaceWeatherPanel />
          <OrbitProfile />
        </aside>
      </main>
    </div>
  )
}
