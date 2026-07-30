/**
 * Context panel for the part selected in the 3D scene.
 *
 * Clicking a solar array, a module or a gyroscope brings up its description and the parameters
 * NASA publishes about it — the direct link between geometry and telemetry that a digital twin
 * promises.
 */
import { PARTS } from '../scene/parts'
import { channelsForPart, subsystemOfPui } from '../telemetry/subsystems'
import { useSelectionStore } from './selection'
import { TelemetryValue } from './TelemetryValue'
import { PartPhoto } from './PartPhoto'
import { PartPicker } from './PartPicker'

const CATEGORY_LABELS: Record<string, string> = {
  module: 'Pressurised module',
  truss: 'Structure',
  power: 'Power',
  thermal: 'Thermal',
  attitude: 'Attitude control',
  comms: 'Communications',
}

export function InspectorPanel() {
  const selected = useSelectionStore((store) => store.selected)
  const select = useSelectionStore((store) => store.select)

  if (!selected) {
    return (
      <section className="panel">
        <h2 className="panel__title">Inspector</h2>
        <p className="panel__empty">
          Click an element of the station — a solar array, a module, a radiator — to see its
          description and its parameters, or choose one below.
        </p>
        <PartPicker />
      </section>
    )
  }

  const part = PARTS[selected]
  const channels = channelsForPart(selected)

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">{part.name}</h2>
          {part.designation && <p className="panel__designation">{part.designation}</p>}
        </div>
        <button type="button" className="button button--ghost" onClick={() => select(null)}>
          Close
        </button>
      </div>

      {/* Kept in place once something is selected, so moving from one part to the next does not
          mean going back to the scene and aiming again. */}
      <PartPicker />

      <p className="panel__category">{CATEGORY_LABELS[part.category] ?? part.category}</p>
      <p className="panel__summary">{part.summary}</p>

      <PartPhoto part={selected} />

      {channels.length > 0 ? (
        <div className="panel__section">
          <h3 className="panel__subtitle">
            Published parameters ({channels.length})
            <span className="panel__subtitle-note">
              {subsystemOfPui(channels[0].pui)?.label ?? ''}
            </span>
          </h3>
          {channels.map((channel) => (
            <TelemetryValue key={channel.pui} pui={channel.pui} showHint />
          ))}
        </div>
      ) : (
        <p className="panel__empty">
          No public parameter describes this element directly. NASA broadcasts only a selection of
          its telemetry.
        </p>
      )}
    </section>
  )
}
