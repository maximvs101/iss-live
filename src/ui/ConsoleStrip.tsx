/**
 * The state of the vehicle, on one line, always.
 *
 * A console does not hide where the vehicle is behind a view switch. These seven cells were in a
 * panel that only existed on the map view, so half the application ran without them on screen; here
 * they sit under the title in both views and never move, which is what makes a strip readable at a
 * glance — the eye learns the position of a cell and stops reading the label.
 *
 * Every figure is computed locally from the orbital elements, so the strip stays populated through
 * a broadcast outage. That is the point of it: when the telemetry goes quiet, this line is what is
 * still true. The one exception is GMT, which is this machine's clock — the station's own clock is
 * a telemetry channel and lives with the readings.
 */
import { useEffect, useState } from 'react'
import { useOrbitStore } from '../orbit/useOrbit'
import { NowOver } from './NowOver'
import { formatLatitude, formatLongitude } from '../orbit/coordinates'

/** UTC, to the second, because a console's timebase is UTC and nothing else. */
function useGmt(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000)
    return () => clearInterval(timer)
  }, [])
  return now.toISOString().slice(11, 19)
}

export function ConsoleStrip() {
  const state = useOrbitStore((store) => store.state)
  const beta = useOrbitStore((store) => store.beta)
  const gmt = useGmt()

  const sunlit = state ? state.shadow < 0.5 : null

  return (
    /*
     * Focusable, because it scrolls.
     *
     * Below about 1100 px the eight cells do not fit and the band scrolls sideways with its
     * scrollbar suppressed. A scrollport with no focusable child is not reachable by keyboard in
     * Chrome or Safari, so Alt, Vel, Beta and Illum simply could not be read without a pointer.
     * `tabIndex` makes it a stop that arrow keys scroll; the group needs a name once it is one.
     */
    <div className="console-strip" tabIndex={0} role="group" aria-label="Vehicle state">
      {/*
        The list inside the scroller, not the scroller itself. `role="group"` on the <dl> made it
        focusable and named and, in the same move, took its list semantics away: every <dt> and
        <dd> lost its parent list and Lighthouse flagged all sixteen. The div scrolls and carries
        the name; the <dl> stays a <dl>.
      */}
      <dl className="console-strip__cells">
      {/* The place first: it is the only cell a reader can use without knowing what the others
          mean, and the two that follow are the same position in figures. */}
      <NowOver />
      <Cell label="GMT" value={gmt} />
      <Cell label="Lat" value={state ? formatLatitude(state.latitude) : '—'} />
      <Cell label="Lon" value={state ? formatLongitude(state.longitude) : '—'} />
      <Cell label="Alt" value={state ? `${state.altitude.toFixed(1)} km` : '—'} />
      <Cell label="Vel" value={state ? `${(state.speed * 3600).toFixed(0)} km/h` : '—'} />
      <Cell label="Beta" value={beta === null ? '—' : `${beta.toFixed(2)}°`} />
      <Cell
        label="Illum"
        value={sunlit === null ? '—' : sunlit ? 'sunlit' : 'shadow'}
        tone={sunlit === null ? undefined : sunlit ? 'live' : 'idle'}
      />
      </dl>
    </div>
  )
}

/**
 * One cell: a label that never changes and a value that does.
 *
 * `dt`/`dd` rather than two spans, so a screen reader reads "altitude, 431.5 km" instead of two
 * loose fragments — the strip is the one place on the page where a value has no other context.
 */
function Cell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'live' | 'idle'
}) {
  return (
    <div className="console-strip__cell">
      <dt>{label}</dt>
      <dd className={tone ? `console-strip__value console-strip__value--${tone}` : 'console-strip__value'}>
        {value}
      </dd>
    </div>
  )
}
