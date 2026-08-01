/**
 * Orbital dashboard.
 *
 * Every figure here is computed from the orbital elements published by Celestrak, so it stays
 * available even when the station broadcasts no telemetry at all. The beta angle measured on board
 * (USLAB000040) is shown next to the computed one as soon as the stream publishes it, giving a
 * direct comparison between model and measurement.
 */
import { useOrbitStore } from '../orbit/useOrbit'
import { TelemetryValue } from './TelemetryValue'

export function OrbitPanel() {
  const state = useOrbitStore((store) => store.state)
  const beta = useOrbitStore((store) => store.beta)
  const elements = useOrbitStore((store) => store.elements)

  if (!state) {
    return (
      <section className="panel">
        <h2 className="panel__title">Orbit</h2>
        <p className="panel__empty">Computing position…</p>
      </section>
    )
  }

  const sunlit = state.shadow < 0.5

  return (
    <section className="panel">
      <h2 className="panel__title">Orbit</h2>

      <div className="metric-grid">
        <Metric label="Latitude" value={formatLatitude(state.latitude)} />
        <Metric label="Longitude" value={formatLongitude(state.longitude)} />
        <Metric label="Altitude" value={`${state.altitude.toFixed(1)} km`} />
        <Metric label="Speed" value={`${(state.speed * 3600).toFixed(0)} km/h`} />
        <Metric label="Orbital period" value={`${state.periodMinutes.toFixed(2)} min`} />
        <Metric label="Visibility circle" value={`${state.footprintKm.toFixed(0)} km`} />
        <Metric
          label="Illumination"
          value={sunlit ? 'sunlit' : 'in shadow'}
          accent={sunlit ? 'sun' : 'shadow'}
          hint="Whether the station is lit, not the ground below it. At 420 km it keeps seeing the Sun for about ten minutes after sunset underneath — which is why it can be sunlit while flying over darkness, and why it is visible from the ground at dusk."
        />
        <Metric
          label="Beta angle (computed)"
          value={beta === null ? '—' : `${beta.toFixed(2)}°`}
          hint="How high the Sun sits above the orbital plane"
        />
      </div>

      <div className="panel__section">
        <h3 className="panel__subtitle">Measured on board</h3>
        <TelemetryValue pui="USLAB000040" />
        <TelemetryValue pui="USLAB000039" />
      </div>

      {elements && (
        <p className="panel__footnote">
          Position computed by SGP4 propagation of orbital elements from{' '}
          {elements.epoch.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC.
        </p>
      )}
    </section>
  )
}

function Metric({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: 'sun' | 'shadow'
}) {
  return (
    <div className={`metric${accent ? ` metric--${accent}` : ''}`} title={hint}>
      <span className="metric__label">{label}</span>
      <span className="metric__value">{value}</span>
    </div>
  )
}

function formatLatitude(value: number): string {
  return `${Math.abs(value).toFixed(3)}° ${value >= 0 ? 'N' : 'S'}`
}

function formatLongitude(value: number): string {
  return `${Math.abs(value).toFixed(3)}° ${value >= 0 ? 'E' : 'W'}`
}
