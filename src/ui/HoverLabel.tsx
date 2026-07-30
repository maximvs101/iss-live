/**
 * Name of the part under the cursor, shown next to it.
 *
 * Without this, identifying an element means clicking it — which also changes the inspector. The
 * label makes the model readable by simply sweeping across it, and shows in passing which parts
 * are clickable at all.
 *
 * It is rendered as an HTML overlay rather than inside the 3D scene: no extra draw call, crisp
 * text at any zoom level, and no interference with the pointer.
 */
import { PARTS } from '../scene/parts'
import { channelsForPart } from '../telemetry/subsystems'
import { useSelectionStore } from './selection'

/** Gap between the cursor and the label, in pixels. */
const OFFSET = 14

export function HoverLabel() {
  const hovered = useSelectionStore((store) => store.hovered)
  const point = useSelectionStore((store) => store.hoverPoint)

  if (!hovered || !point) return null

  const part = PARTS[hovered]
  const channelCount = channelsForPart(hovered).length

  // Flip the label to the other side of the cursor when it would overflow the window.
  const flipX = point.x > window.innerWidth - 260
  const flipY = point.y > window.innerHeight - 90

  return (
    <div
      className="hover-label"
      style={{
        left: point.x + (flipX ? -OFFSET : OFFSET),
        top: point.y + (flipY ? -OFFSET : OFFSET),
        transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`,
      }}
      aria-hidden="true"
    >
      <span className="hover-label__name">{part.name}</span>
      {part.designation && <span className="hover-label__designation">{part.designation}</span>}
      <span className="hover-label__meta">
        {channelCount > 0
          ? `${channelCount} parameter${channelCount > 1 ? 's' : ''} · click to inspect`
          : 'click to inspect'}
      </span>
    </div>
  )
}
