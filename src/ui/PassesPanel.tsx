/**
 * Upcoming passes of the station over the observer's location.
 *
 * Computed entirely from the orbital elements, so this panel works whether or not the station is
 * broadcasting telemetry. Passes are listed in the browser's local time, since the reader is the
 * one who has to be outside looking up.
 */
import { useMemo, useState } from 'react'
import { useOrbitStore } from '../orbit/useOrbit'
import { useObserverStore } from '../orbit/observer'
import { compassPoint, findPasses, type Pass } from '../orbit/passes'

/** How far ahead to search. Three days keeps the computation instant and the list readable. */
const SEARCH_HOURS = 72

export function PassesPanel() {
  const elements = useOrbitStore((store) => store.elements)
  const observer = useObserverStore((store) => store.observer)
  const status = useObserverStore((store) => store.status)
  const locate = useObserverStore((store) => store.locate)
  const setObserver = useObserverStore((store) => store.setObserver)

  const [visibleOnly, setVisibleOnly] = useState(false)
  /**
   * Shut to begin with, and it stays that way until asked.
   *
   * Three days of passes is a long list and a tall panel, and it answers a question most visitors
   * did not come with: they came to see where the station is. Folded away it costs one line.
   */
  const [open, setOpen] = useState(false)

  const passes = useMemo(() => {
    // Nothing is searched while the panel is shut — 72 hours of propagation for a list nobody has
    // asked to see is work done for its own sake.
    if (!open || !elements || !observer) return []
    return findPasses(elements.satrec, observer, new Date(), {
      hours: SEARCH_HOURS,
      minElevation: 10,
    })
  }, [open, elements, observer])

  const shown = visibleOnly ? passes.filter((pass) => pass.visible) : passes
  const visibleCount = passes.filter((pass) => pass.visible).length

  const summary = observer
    ? `${observer.label ?? 'Location'} · ${formatCoordinate(observer.latitude, 'NS')} ${formatCoordinate(observer.longitude, 'EW')}`
    : 'Set a location'

  return (
    <details
      className="panel panel--folding"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="panel__toggle">
        <h2 className="panel__title">Passes overhead</h2>
        <span className="panel__designation">{summary}</span>
      </summary>

      {!observer ? (
        <>
          <p className="panel__summary">
            Set a location to see when the station flies over it, and whether it will be bright
            enough to spot with the naked eye.
          </p>
          <LocationForm status={status} onLocate={locate} onSubmit={setObserver} />
        </>
      ) : (
        <PassList
          passes={passes}
          shown={shown}
          visibleCount={visibleCount}
          visibleOnly={visibleOnly}
          onVisibleOnly={setVisibleOnly}
          onChangeLocation={() => setObserver(null)}
        />
      )}
    </details>
  )
}

function PassList({
  passes,
  shown,
  visibleCount,
  visibleOnly,
  onVisibleOnly,
  onChangeLocation,
}: {
  passes: Pass[]
  shown: Pass[]
  visibleCount: number
  visibleOnly: boolean
  onVisibleOnly: (value: boolean) => void
  onChangeLocation: () => void
}) {
  return (
    <>
      <p className="panel__summary">
        {passes.length} passes above 10° in the next {SEARCH_HOURS} hours,{' '}
        {visibleCount > 0 ? (
          <>
            <strong>{visibleCount}</strong> of them visible to the naked eye.
          </>
        ) : (
          'none of them visible to the naked eye — every one falls in daylight or in the Earth’s shadow.'
        )}
      </p>

      <div className="passes__controls">
        {visibleCount > 0 && (
          <label className="passes__filter">
            <input
              type="checkbox"
              checked={visibleOnly}
              onChange={(event) => onVisibleOnly(event.target.checked)}
            />
            Visible passes only
          </label>
        )}
        <button type="button" className="button" onClick={onChangeLocation}>
          Change location
        </button>
      </div>

      <div className="panel__section">
        {shown.length === 0 ? (
          <p className="panel__empty">No pass in this window.</p>
        ) : (
          shown.map((pass) => <PassRow key={pass.start.date.toISOString()} pass={pass} />)
        )}
      </div>

      <p className="panel__footnote">
        Times are local to this browser. Visibility requires three things at once: the station high
        enough, lit by the Sun, and the sky dark where you are. Magnitudes are estimates — lower is
        brighter, and anything under 0 is unmistakable.
      </p>
    </>
  )
}

function PassRow({ pass }: { pass: Pass }) {
  const time = (date: Date) =>
    date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = pass.start.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <article className={`pass${pass.visible ? ' pass--visible' : ''}`}>
      <div className="pass__when">
        <span className="pass__day">{day}</span>
        <span className="pass__time">{time(pass.start.date)}</span>
      </div>

      <div className="pass__detail">
        <span className="pass__track">
          {compassPoint(pass.start.azimuth)} → {compassPoint(pass.culmination.azimuth)} →{' '}
          {compassPoint(pass.end.azimuth)}
        </span>
        <span className="pass__meta">
          max {pass.maxElevation.toFixed(0)}° · {Math.round(pass.durationSeconds / 60)} min
          {pass.visible && pass.brightestMagnitude !== null && (
            <> · mag {pass.brightestMagnitude.toFixed(1)}</>
          )}
        </span>
      </div>

      {pass.visible && <span className="pass__badge">visible</span>}
    </article>
  )
}

function LocationForm({
  status,
  onLocate,
  onSubmit,
}: {
  status: string
  onLocate: () => void
  onSubmit: (observer: { latitude: number; longitude: number; label?: string }) => void
}) {
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')

  const lat = Number.parseFloat(latitude)
  const lon = Number.parseFloat(longitude)
  const valid = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180

  return (
    <div className="panel__section">
      <button type="button" className="button button--wide" onClick={onLocate}>
        {status === 'locating' ? 'Locating…' : 'Use my location'}
      </button>

      {status === 'denied' && (
        <p className="panel__empty">
          Location permission was refused. Enter the coordinates below instead.
        </p>
      )}
      {status === 'unavailable' && (
        <p className="panel__empty">
          This browser cannot provide a location. Enter the coordinates below instead.
        </p>
      )}

      <form
        className="coords"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) onSubmit({ latitude: lat, longitude: lon })
        }}
      >
        <label>
          Latitude
          <input
            type="text"
            inputMode="decimal"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            placeholder="48.8566"
          />
        </label>
        <label>
          Longitude
          <input
            type="text"
            inputMode="decimal"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            placeholder="2.3522"
          />
        </label>
        <button type="submit" className="button" disabled={!valid}>
          Set
        </button>
      </form>
    </div>
  )
}

function formatCoordinate(value: number, axis: 'NS' | 'EW'): string {
  const positive = axis === 'NS' ? 'N' : 'E'
  const negative = axis === 'NS' ? 'S' : 'W'
  return `${Math.abs(value).toFixed(3)}° ${value >= 0 ? positive : negative}`
}
