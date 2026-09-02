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

/**
 * One per category the inventory actually uses, checked by a test rather than by eye.
 *
 * Three were missing — robotics, science and platform — so Canadarm2, Dextre, the Mobile
 * Transporter, AMS and the two stowage platforms printed their raw identifier under their name:
 * `robotics`, lowercase, where every other part reads `Pressurised module`. The fallback that let
 * that through is kept, because a label is not worth a blank line, but nothing should reach it.
 *
 * `attitude` was here and no part carries it; it was the only entry with nothing behind it.
 */
const CATEGORY_LABELS: Record<string, string> = {
  module: 'Pressurised module',
  truss: 'Structure',
  power: 'Power',
  thermal: 'Thermal',
  robotics: 'Robotics',
  science: 'Science',
  comms: 'Communications',
  platform: 'Stowage platform',
}

/** Exported so a test can hold it against the inventory rather than against this list. */
export const PART_CATEGORY_LABELS = CATEGORY_LABELS

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

      {/* Keyed on the part, so a change remounts rather than resetting in an effect: the state
          reset used to happen *after* the commit, so one frame was painted with the previous
          part's photograph under the new part's name. */}
      <PartPhoto key={selected} part={selected} />

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
