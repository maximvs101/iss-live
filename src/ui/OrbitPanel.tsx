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

  /*
   * The same panel before the first position as after it, with dashes where the figures go.
   *
   * It used to be a one-line "Computing position…" that grew into the full panel a moment later,
   * and everything under it in the side column — freshness, the two plots, the guide — jumped
   * down to make room. Lighthouse measured that jump at 0.144 of cumulative layout shift on a
   * desktop, most of the page's total, for a state that lasts under a second.
   */
  const sunlit = state ? state.shadow < 0.5 : null

  return (
    <section className="panel">
      <h2 className="panel__title">Orbit</h2>

      {/*
        Position, altitude, speed and illumination moved to the console strip under the title,
        where they are on screen in both views instead of only this one. What stays here is what
        the strip cannot say in a cell: the shape of the orbit, and the comparison between the
        angle this application computes and the one the station measures — which is the whole
        reason both are on the page, and why beta appears twice on purpose.
      */}
      <div className="metric-grid">
        <Metric label="Orbital period" value={state ? `${state.periodMinutes.toFixed(2)} min` : '—'} />
        <Metric label="Visibility circle" value={state ? `${state.footprintKm.toFixed(0)} km` : '—'} />
        <Metric
          label="Beta angle (computed)"
          value={beta === null ? '—' : `${beta.toFixed(2)}°`}
          hint="How high the Sun sits above the orbital plane"
        />
        <Metric
          label="Illumination"
          value={sunlit === null ? '—' : sunlit ? 'sunlit' : 'in shadow'}
          accent={sunlit === null ? undefined : sunlit ? 'sun' : 'shadow'}
          hint="Whether the station is lit, not the ground below it. At 420 km it keeps seeing the Sun for about ten minutes after sunset underneath — which is why it can be sunlit while flying over darkness, and why it is visible from the ground at dusk."
        />
      </div>

      <div className="panel__section">
        <h3 className="panel__subtitle">Measured on board</h3>
        <TelemetryValue pui="USLAB000040" />
        <TelemetryValue pui="USLAB000039" />
      </div>

      <p className="panel__footnote">
        {elements ? (
          <>
            Position computed by SGP4 propagation of orbital elements from{' '}
            {elements.epoch.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC. Checked against an
            independent propagation of the same elements, it agrees to about a kilometre on the
            ground — which is why the coordinates stop at two decimals.
          </>
        ) : (
          // The same paragraph, occupied, so the panel is its final height before the elements
          // land rather than growing four lines when they do.
          <>
            Position computed by SGP4 propagation of orbital elements from Celestrak, which are
            being fetched. Checked against an independent propagation of the same elements, it
            agrees to about a kilometre on the ground — which is why the coordinates stop at two
            decimals.
          </>
        )}
      </p>
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
