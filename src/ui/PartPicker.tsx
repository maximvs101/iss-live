/**
 * Choosing a part without a mouse.
 *
 * Until now the only way into the inspector was a click on a mesh in the 3D scene:
 * `onClick` and `onPointerMove` on the model, and nothing else. That excludes a keyboard entirely,
 * and it is barely usable on a tablet — hovering does not exist there, and hitting a named strut
 * with a fingertip is a test of aim rather than of intent. Tablets are a stated target, so this is
 * a functional gap on a supported device, not a nicety.
 *
 * A grouped `<select>` rather than a list: forty-seven parts as a list would be taller than the
 * panel holding it, while a select is one control the platform already makes reachable, operable
 * and announced — on a phone it even becomes a native picker. It matches the plot picker in the
 * telemetry strip, so the idiom is not new to the page either.
 */
import { PARTS, type PartCategory, type PartId } from '../scene/parts'
import { useSelectionStore } from './selection'

/** Group order and headings. Modules first — they are what a visitor comes looking for. */
const GROUPS: { category: PartCategory; label: string }[] = [
  { category: 'module', label: 'Pressurised modules' },
  { category: 'truss', label: 'Truss' },
  { category: 'power', label: 'Power' },
  { category: 'thermal', label: 'Thermal' },
  { category: 'robotics', label: 'Robotics' },
  { category: 'science', label: 'Science' },
  { category: 'comms', label: 'Communications' },
  { category: 'platform', label: 'Stowage platforms' },
]

export function PartPicker() {
  const selected = useSelectionStore((store) => store.selected)
  const select = useSelectionStore((store) => store.select)
  const parts = Object.values(PARTS)

  return (
    <label className="part-picker">
      <span className="part-picker__label">Part</span>
      <select
        className="plot__select"
        value={selected ?? ''}
        onChange={(event) => select((event.target.value || null) as PartId | null)}
      >
        <option value="">Choose a part…</option>
        {GROUPS.map(({ category, label }) => {
          const inGroup = parts.filter((part) => part.category === category)
          if (inGroup.length === 0) return null
          return (
            <optgroup key={category} label={label}>
              {inGroup.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.name}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
    </label>
  )
}
