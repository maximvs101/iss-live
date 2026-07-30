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

  useEffect(() => {
    if (!elements) return
    const refresh = () => setProfile(computeProfile(elements.satrec, new Date()))
    refresh()
    // The profile slides with time; refreshing every five minutes is enough.
    const timer = setInterval(refresh, 5 * 60_000)
    return () => clearInterval(timer)
  }, [elements])

  if (!profile) {
    return (
      <section className="panel">
        <h2 className="panel__title">Next orbit</h2>
        <p className="panel__empty">Computing orbital profile…</p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Next orbit</h2>
      <p className="panel__summary">
        Over the next {HORIZON_MINUTES} minutes the station will spend{' '}
        {profile.eclipseMinutes.toFixed(0)} minutes in Earth’s shadow — the shaded bands on the
        charts.
      </p>

      <LineChart
        points={profile.altitude}
        title="Altitude"
        unit="km"
        bands={profile.shadowBands}
        precision={1}
      />

      <LineChart
        points={profile.latitude}
        title="Latitude overflown"
        unit="°"
        bands={profile.shadowBands}
        precision={1}
      />

      <p className="panel__footnote">
        Profile computed by SGP4 propagation. The orbit is near-circular: the altitude variation
        seen here comes from the shape of the Earth, which is flattened at the poles.
      </p>
    </section>
  )
}
