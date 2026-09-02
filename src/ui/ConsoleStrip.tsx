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
    <dl className="console-strip">
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

/*
 * Two decimals, not three, because the third was never a measurement.
 *
 * A thousandth of a degree is about 110 m. What this position is actually worth is 0.79 km, which
 * is how far it sits from `api.wheretheiss.at` given the same elements — and that is agreement
 * between two SGP4 propagations, not accuracy against the station, which is looser still and grows
 * with the age of the elements. Printing a digit worth 110 m on a figure uncertain by 800 claims a
 * precision nothing here has. Two decimals is 1.1 km, which is honestly the resolution available.
 *
 * These lived in the orbital panel until the position moved up here; they came with it.
 */
function formatLatitude(value: number): string {
  return `${Math.abs(value).toFixed(2)}° ${value >= 0 ? 'N' : 'S'}`
}

function formatLongitude(value: number): string {
  return `${Math.abs(value).toFixed(2)}° ${value >= 0 ? 'E' : 'W'}`
}
