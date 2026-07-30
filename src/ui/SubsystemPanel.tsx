/**
 * Telemetry browsing by subsystem, in the spirit of the mission control consoles: power, life
 * support, thermal, attitude, communications, onboard computers.
 */
import { useState } from 'react'
import { SUBSYSTEMS, getChannel, type SubsystemId } from '../telemetry/subsystems'
import { PLOTTABLE, defaultPlot } from '../telemetry/plottable'
import { getSymbol } from '../data/catalog'
import { TelemetryValue } from './TelemetryValue'
import { TelemetryChart } from './charts/TelemetryChart'

export function SubsystemPanel() {
  const [active, setActive] = useState<SubsystemId>('eps')
  // Kept per subsystem, so switching tabs and coming back does not lose the chosen trace.
  const [plotted, setPlotted] = useState<Partial<Record<SubsystemId, string>>>({})
  const subsystem = SUBSYSTEMS.find((item) => item.id === active)

  const choices = PLOTTABLE[active]
  const pui = plotted[active] ?? defaultPlot(active)

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

          {/* Column *flow*, not a grid: in a grid the tallest section sets the height of its whole
              row, and a sixteen-channel block left half the strip empty beside it. */}
          <div className="telemetry__sections">
            {subsystem.sections.map((section) => (
              <div key={section.id} className="panel__section">
                <h3 className="panel__subtitle">{section.label}</h3>
                {section.channels.map((channel) => (
                  <TelemetryValue key={channel.pui} pui={channel.pui} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
