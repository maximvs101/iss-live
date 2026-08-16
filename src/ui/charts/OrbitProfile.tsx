/**
 * Profile of the next orbit: altitude and the day/night cycle.
 *
 * Entirely computed from the orbital elements, so it is always available, even when the station
 * broadcasts no telemetry at all. It is also the clearest picture of the rhythm of life on board:
 * roughly sixteen sunrises a day.
 */
import { useEffect, useState } from 'react'
import { useOrbitStore } from '../../orbit/useOrbit'
import { propagateIss } from '../../orbit/propagator'
import { LineChart, type Band, type Point } from './LineChart'
import { useElementWidth } from '../useElementWidth'

/** Window covered: one full orbit, a little over 92 minutes. */
const HORIZON_MINUTES = 95
const STEP_SECONDS = 60

interface Profile {
  altitude: Point[]
  latitude: Point[]
  shadowBands: Band[]
  /** Total time spent in shadow over the window, in minutes. */
  eclipseMinutes: number
}

function computeProfile(satrec: Parameters<typeof propagateIss>[0], from: Date): Profile | null {
  const altitude: Point[] = []
  const latitude: Point[] = []
  const shadowBands: Band[] = []

  let bandStart: number | null = null
  let eclipseMinutes = 0

  for (let minute = 0; minute <= HORIZON_MINUTES; minute += STEP_SECONDS / 60) {
    const date = new Date(from.getTime() + minute * 60_000)
    const state = propagateIss(satrec, date)
    if (!state) continue

    const t = date.getTime()
    altitude.push({ t, value: state.altitude })
    latitude.push({ t, value: state.latitude })

    const inShadow = state.shadow >= 0.5
    if (inShadow) {
      eclipseMinutes += STEP_SECONDS / 60
      if (bandStart === null) bandStart = t
    } else if (bandStart !== null) {
      shadowBands.push({ from: bandStart, to: t, color: 'rgba(60, 82, 112, 0.35)', label: 'shadow' })
      bandStart = null
    }
  }

  if (bandStart !== null) {
    shadowBands.push({
      from: bandStart,
      to: altitude[altitude.length - 1]?.t ?? bandStart,
      color: 'rgba(60, 82, 112, 0.35)',
      label: 'shadow',
    })
  }

  if (altitude.length < 2) return null
  return { altitude, latitude, shadowBands, eclipseMinutes }
}

export function OrbitProfile() {
  const elements = useOrbitStore((store) => store.elements)
  const [profile, setProfile] = useState<Profile | null>(null)

  /*
   * Drawn at the number of units it occupies, the way `TelemetryChart` already is.
   *
   * These two took `LineChart`'s default resolution instead, and the default was authored for the
   * width they get on a desktop. On a phone the same 900-unit drawing is laid out 343 px wide, a
   * scale of 0.38, and the 8-unit axis labels reach the screen at **3.0 px** — measured, not
   * estimated. Nothing was wrong with the type size; it was being shrunk under the reader.
   *
   * The floor is 200 and not the 340 `TelemetryChart` uses, because these two live in the side
   * column and that column is **285 px** wide at 1280 — a 340 floor sits above the real width and
   * puts the scale back at 0.838, which is most of the fault reintroduced. The axes actually cost
   * 98 units (46 left, 52 right), so 200 still leaves the series a hundred to draw in, and it is
   * only ever reached if the measurement fails outright.
   *
   * Measured after: scale 1.000 on a phone and 0.949 in the desktop side column, where the box
   * read 300 against the 285 the figure inside it takes. Labels land at 7.6 px instead of 8.0 —
   * five per cent, against the 0.317 and 3.0 px they were at. Closing that last gap means moving
   * the measurement inside `LineChart`, which is a change to every chart and not this one.
   */
  const [box, measured] = useElementWidth<HTMLDivElement>()
  const width = Math.max(measured, 200)

  useEffect(() => {
    if (!elements) return
    const refresh = () => setProfile(computeProfile(elements.satrec, new Date()))
    refresh()
    // The profile slides with time; refreshing every five minutes is enough.
    const timer = setInterval(refresh, 5 * 60_000)
    return () => clearInterval(timer)
  }, [elements])

  /*
   * One return, and the measured box never unmounts.
   *
   * Written as an early return for the "computing" state, the box mounted only once a profile
   * existed — after `useElementWidth`'s layout effect had already run and found nothing to observe.
   * The measurement stayed at 0, the width fell back to its 340 floor, and the fix read as working
   * because 340 is close enough to a phone's 343 to hide it. It would not have been close on a
   * desktop.
   */
  return (
    <section className="panel">
      <h2 className="panel__title">Next orbit</h2>

      {profile ? (
        <p className="panel__summary">
          Over the next {HORIZON_MINUTES} minutes the station will spend{' '}
          {profile.eclipseMinutes.toFixed(0)} minutes in Earth’s shadow — the shaded bands on the
          charts.
        </p>
      ) : (
        <p className="panel__empty">Computing orbital profile…</p>
      )}

      <div ref={box}>
        {profile && (
          <>
            <LineChart
              points={profile.altitude}
              title="Altitude"
              unit="km"
              bands={profile.shadowBands}
              precision={1}
              width={width}
            />

            <LineChart
              points={profile.latitude}
              title="Latitude overflown"
              unit="°"
              bands={profile.shadowBands}
              precision={1}
              width={width}
            />
          </>
        )}
      </div>

      {profile && (
        <p className="panel__footnote">
          Profile computed by SGP4 propagation. The orbit is near-circular: the altitude variation
          seen here comes from the shape of the Earth, which is flattened at the poles.
        </p>
      )}
    </section>
  )
}
