/**
 * Telemetry browsing by subsystem, in the spirit of the mission control consoles: power, life
 * support, thermal, attitude, communications, onboard computers.
 */
import { useEffect, useMemo, useState } from 'react'
import { SUBSYSTEMS, getChannel, type SubsystemId } from '../telemetry/subsystems'
import { useTelemetryStore } from '../telemetry/store'
import { readingOf } from '../telemetry/freshness'
import { PLOTTABLE, defaultPlot } from '../telemetry/plottable'
import { getSymbol } from '../data/catalog'
import { TelemetryValue } from './TelemetryValue'
import { TelemetryChart } from './charts/TelemetryChart'
import { columnCount, distribute } from './telemetryColumns'
import { useElementWidth } from './useElementWidth'

export function SubsystemPanel() {
  const [active, setActive] = useState<SubsystemId>('eps')
  // Kept per subsystem, so switching tabs and coming back does not lose the chosen trace.
  const [plotted, setPlotted] = useState<Partial<Record<SubsystemId, string>>>({})
  const stoppedCounts = useStoppedCounts()
  const subsystem = SUBSYSTEMS.find((item) => item.id === active)

  const choices = PLOTTABLE[active]
  const pui = plotted[active] ?? defaultPlot(active)

  /*
   * The columns are cut here rather than by `columns: 260px`, for one reason: a section that runs
   * past the foot of a column resumed at the top of the next one with no heading over it. On a
   * 2560-wide screen that was six of the seven columns. The browser cannot repeat a heading it
   * broke; whoever decides the break can. See `telemetryColumns` for the split and its cost.
   */
  const [strip, stripWidth] = useElementWidth<HTMLDivElement>()
  const columns = useMemo(
    () =>
      distribute(
        (subsystem?.sections ?? []).map((section) => ({
          id: section.id,
          label: section.label,
          // A hidden channel is subscribed and read by another row; it gets no line of its own.
          channels: section.channels.filter((c) => !c.hidden).map((channel) => channel.pui),
        })),
        columnCount(stripWidth),
      ),
    [subsystem, stripWidth],
  )

  return (
    <section className="panel panel--telemetry" aria-labelledby="subsystems-head">
      <div className="telemetry__frame">
        {/*
          A rail, not a row of tabs.

          Tabs answer "what am I looking at"; this has to answer "where should I be looking",
          which a tab strip cannot: five of the six subsystems were a word with nothing beside
          it, so the one holding seven stopped sensors looked exactly like the five that were
          fine. Each line now carries its channel count and its stopped count, and the six sit
          one under the other where a column of numbers can be read down.
        */}
        <nav className="rail" aria-label="Subsystems">
          <div className="rail__inner">
            <p className="rail__head" id="subsystems-head">
              Subsystems
            </p>
            {RAIL.map((item) => {
              const stopped = stoppedCounts[item.id] ?? 0
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === active}
                  /*
                   * The two figures are drawn, not spoken as part of the name. Left as plain
                   * spans they became the button's accessible name — "Life support 32 7, toggle
                   * button" — two integers a listener has no way to read.
                   */
                  aria-label={`${item.label}: ${item.puis.length} channels, ${stopped} stopped`}
                  className={`rail__item${item.id === active ? ' rail__item--active' : ''}`}
                  onClick={() => setActive(item.id)}
                >
                  <span className="rail__label" aria-hidden="true">
                    {item.label}
                  </span>
                  <span className="rail__count" aria-hidden="true">
                    {item.puis.length}
                  </span>
                  <span
                    className={`rail__flag${stopped > 0 ? ' rail__flag--on' : ''}`}
                    aria-hidden="true"
                  >
                    {stopped > 0 ? stopped : '·'}
                  </span>
                </button>
              )
            })}
            {subsystem && <p className="rail__consoles">{subsystem.disciplines.join(', ')}</p>}
          </div>
        </nav>

        <div className="telemetry__main">
      {subsystem && <p className="panel__summary telemetry__tagline">{subsystem.tagline}</p>}

      {subsystem && (
        <div className="telemetry__body">
          {choices.length > 0 && pui ? (
            <div className="plot">
              <label className="plot__picker">
                <span className="plot__picker-label">Plot</span>
                <select
                  className="plot__select"
                  value={pui}
                  onChange={(event) => setPlotted({ ...plotted, [active]: event.target.value })}
                >
                  {choices.map((choice) => (
                    <option key={choice} value={choice}>
                      {getChannel(choice)?.label ?? getSymbol(choice)?.description ?? choice}
                    </option>
                  ))}
                </select>
              </label>
              {/* 96 units tall against a width of about 1270: a strip chart, which is the shape a
                  console uses for a single trace and the shape that leaves the readings room. */}
              <TelemetryChart pui={pui} height={96} />
            </div>
          ) : (
            // Said plainly rather than left blank: this subsystem publishes nothing continuous.
            <p className="plot__none">
              Nothing here changes over time — every channel is a state, a clock or a counter. No
              plot would tell you anything a value cannot.
            </p>
          )}

          <div className="telemetry__sections" ref={strip}>
            {columns.map((column, index) => (
              // Position is the only identity a column has, and the layout is recomputed whole
              // whenever the width changes, so there is nothing for a better key to preserve.
              <div key={index} className="telemetry__column">
                {column.map((block) => (
                  <div key={block.key} className="panel__section">
                    <h3
                      className={`panel__subtitle${block.continued ? ' panel__subtitle--continued' : ''}`}
                    >
                      {block.label}
                    </h3>
                    {block.channels.map((channel) => (
                      <TelemetryValue key={channel} pui={channel} />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
        </div>
      </div>
    </section>
  )
}

/**
 * The six rows of the rail, built once.
 *
 * Hidden channels are left out here for the same reason the columns leave them out: they have no
 * row, so counting them made the rail disagree with the list beside it.
 */
const RAIL = SUBSYSTEMS.map((subsystem) => ({
  id: subsystem.id,
  label: subsystem.label,
  puis: [
    ...new Set(
      subsystem.sections.flatMap((section) =>
        section.channels.filter((channel) => !channel.hidden).map((channel) => channel.pui),
      ),
    ),
  ],
}))

/**
 * Recomputed on a timer, not on the stream.
 *
 * Six per-row store subscriptions were doing this, and zustand runs a selector on every `set()`
 * to decide whether to re-render: the store flushes four times a second and the six partition all
 * 163 channels, so it cost about 650 `Reading` objects and 1 300 map lookups a second to produce
 * six integers that move at most once a day. Reading the store on the tick instead — no
 * subscription at all — costs 163 lookups every five seconds, and the boundary these counts sit
 * on is twenty-four hours.
 */
const REFRESH_MS = 5_000

function useStoppedCounts(): Partial<Record<SubsystemId, number>> {
  const [counts, setCounts] = useState<Partial<Record<SubsystemId, number>>>({})

  useEffect(() => {
    const measure = () => {
      const { samples } = useTelemetryStore.getState()
      const now = Date.now()
      const next: Partial<Record<SubsystemId, number>> = {}
      for (const item of RAIL) {
        next[item.id] = item.puis.filter(
          (pui) => readingOf(pui, samples[pui], now).state === 'stopped',
        ).length
      }
      setCounts((previous) =>
        RAIL.every((item) => previous[item.id] === next[item.id]) ? previous : next,
      )
    }

    measure()
    const timer = setInterval(measure, REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  return counts
}
