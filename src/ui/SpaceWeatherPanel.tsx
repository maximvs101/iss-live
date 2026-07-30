/**
 * Space weather, folded away until asked for.
 *
 * Collapsed by default and summarised in its own heading, for the same reason the passes panel is:
 * it is context, not the subject. But the summary line is written to be worth reading on its own —
 * `Kp 7.3 · 2 M-class flares` tells you whether to open it.
 */
import { useEffect, useState } from 'react'
import {
  WINDOW_DAYS,
  fetchSpaceWeather,
  flareFlux,
  isNotableFlare,
  stormScale,
  type Flare,
  type SpaceWeather,
  type Storm,
} from '../space-weather/donki'

/** How many events to list. Enough to show the shape of the month, short enough to read. */
const SHOWN = 5

export function SpaceWeatherPanel() {
  const [weather, setWeather] = useState<SpaceWeather | null>(null)

  useEffect(() => {
    let cancelled = false
    // `fetchSpaceWeather` never rejects — it returns a stale flag instead — so there is no catch.
    fetchSpaceWeather().then((result) => {
      if (!cancelled) setWeather(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const notable = weather?.flares.filter((flare) => isNotableFlare(flare.classType)) ?? []
  /**
   * Listed strongest first, not most recent first.
   *
   * Date order looked like the obvious choice until the data argued otherwise: this month brought
   * 65 M-class flares and 2 X-class, so a list of the five newest was five M1s and the only two
   * events anyone would want to know about were sixty rows down.
   */
  const strongestFlares = [...(weather?.flares ?? [])].sort(
    (a, b) => flareFlux(b.classType) - flareFlux(a.classType),
  )
  const strongest =
    weather?.storms.reduce<Storm | null>(
      (best, storm) => (!best || storm.peakKp > best.peakKp ? storm : best),
      null,
    ) ?? null

  return (
    <details className="panel panel--folding">
      <summary className="panel__toggle">
        <h2 className="panel__title">Space weather</h2>
        <span className="panel__designation">
          {summarise(weather, strongestFlares[0] ?? null, strongest)}
        </span>
      </summary>

      <p className="panel__summary">
        What the Sun has done in the last {WINDOW_DAYS} days, as reported by NASA&rsquo;s DONKI. Two
        things here reach the station: a large flare raises the radiation dose on board, and a
        geomagnetic storm heats the upper atmosphere until the extra drag pulls the orbit down
        measurably faster.
      </p>

      {weather === null ? (
        <p className="panel__empty">Asking DONKI…</p>
      ) : (
        <>
          {weather.stale && (
            <p className="panel__empty">
              DONKI could not be reached. Showing the last answer received, which may be out of
              date.
            </p>
          )}

          <div className="panel__section">
            <h3 className="panel__subtitle">
              Geomagnetic storms
              <span className="panel__subtitle-note">{weather.storms.length} reported</span>
            </h3>
            {weather.storms.length === 0 ? (
              <p className="panel__empty">None — the magnetosphere has been quiet.</p>
            ) : (
              weather.storms.slice(0, 4).map((storm) => <StormRow key={storm.id} storm={storm} />)
            )}
          </div>

          <div className="panel__section">
            <h3 className="panel__subtitle">
              Strongest flares
              <span className="panel__subtitle-note">
                {notable.length} of {weather.flares.length} at M or above
              </span>
            </h3>
            {weather.flares.length === 0 ? (
              <p className="panel__empty">None recorded.</p>
            ) : (
              strongestFlares
                .slice(0, SHOWN)
                .map((flare) => <FlareRow key={flare.id} flare={flare} />)
            )}
          </div>

          <p className="panel__footnote">
            Flare classes are decades of X-ray flux: each letter is ten times the last, so C9 is a
            tenth of M1. Kp runs 0–9; NASA and NOAA call anything from 5 a storm.
          </p>
        </>
      )}
    </details>
  )
}

/**
 * The one line visible while the panel is shut.
 *
 * Names the two worst events rather than counting them. "67 flares at M+" was the first attempt
 * and it turned out to say nothing: near solar maximum an M-class flare is a weekly occurrence, so
 * the count tells you about the Sun's cycle, not about the month. `X1.1` tells you about the month.
 */
function summarise(
  weather: SpaceWeather | null,
  worstFlare: Flare | null,
  worstStorm: Storm | null,
): string {
  if (weather === null) return 'loading'
  const parts: string[] = []
  if (worstStorm) {
    const scale = stormScale(worstStorm.peakKp)
    parts.push(`Kp ${worstStorm.peakKp.toFixed(1)}${scale ? ` · ${scale.level}` : ''}`)
  }
  if (worstFlare) parts.push(`flare ${worstFlare.classType}`)
  return parts.length > 0 ? parts.join(' · ') : 'quiet'
}

const when = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function StormRow({ storm }: { storm: Storm }) {
  const scale = stormScale(storm.peakKp)
  return (
    <div className="weather-row">
      <span className="weather-row__when">{when(storm.start)}</span>
      <span className="weather-row__what">
        {scale ? `${scale.level} — ${scale.label}` : 'below storm level'}
      </span>
      <span className="weather-row__value">Kp {storm.peakKp.toFixed(2).replace(/\.?0+$/, '')}</span>
    </div>
  )
}

function FlareRow({ flare }: { flare: Flare }) {
  const notable = isNotableFlare(flare.classType)
  return (
    <div className={`weather-row${notable ? ' weather-row--notable' : ''}`}>
      <span className="weather-row__when">{when(flare.peak)}</span>
      <span className="weather-row__what">
        {flare.region ? `from ${flare.region}` : 'source not located'}
      </span>
      <span className="weather-row__value">{flare.classType}</span>
    </div>
  )
}
