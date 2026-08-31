/**
 * Telemetry browsing by subsystem, in the spirit of the mission control consoles: power, life
 * support, thermal, attitude, communications, onboard computers.
 */
import { useMemo, useState } from 'react'
import { SUBSYSTEMS, getChannel, type SubsystemId } from '../telemetry/subsystems'
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
    <section className="panel panel--telemetry">
      {/* Title and tabs share a row: this panel is wide and short, so every line of height it
          does not spend on chrome is a line of readings. */}
      <header className="telemetry__head">
        <h2 className="panel__title">Subsystems</h2>

        <nav className="tabs">
          {SUBSYSTEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tabs__item${item.id === active ? ' tabs__item--active' : ''}`}
              onClick={() => setActive(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {subsystem && (
          <p className="panel__category telemetry__consoles">
            {subsystem.disciplines.join(', ')}
          </p>
        )}
      </header>

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
    </section>
  )
}
