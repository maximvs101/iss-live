/**
 * Says when the station on screen has stopped moving because the data stopped.
 *
 * The scene keeps drawing the joints at the last angles it received, which is the right thing to
 * do — a station that snapped back to a rest pose on every loss of signal would be worse — but it
 * is also silent about it. That silence has a measurable cost: the arrays go on pointing where the
 * Sun *was*, and the Sun keeps moving at 3.87° per minute, so after a quarter of an hour the scene
 * shows sunlight falling on panels edge-on to it and nothing says why.
 *
 * This was found by measuring rather than by looking. The wings came out 50.2° off the Sun, which
 * looked like a rigging error until the stream header admitted to a 13 min 17 s outage:
 * 13.3 × 3.87 = 51.5°, and the required correction drifted at exactly the solar rate while the
 * telemetry sat still. Nothing was wrong with the model — only with what it could know.
 *
 * The header already reports the outage. This says what it means *here*, where a reader is looking
 * at the consequence rather than at the cause.
 */
import { useStreamStatus, formatAge } from '../telemetry/health'

/** Below this there is nothing to say: the joints move in steps anyway. */
const WORTH_SAYING_MS = 90_000

/** Degrees the Sun moves in the station's frame per minute — one revolution per 92.96 min. */
const SUN_DEGREES_PER_MINUTE = 360 / 92.96

export function FrozenJoints() {
  const status = useStreamStatus()
  const age = status.ageMs

  if (age === null || age < WORTH_SAYING_MS) return null

  // What the silence costs, in the units the scene is actually wrong by.
  const drift = Math.round((age / 60_000) * SUN_DEGREES_PER_MINUTE)

  return (
    <p className="frozen-joints" role="status">
      <strong>Joints frozen</strong> — no telemetry for {formatAge(age)}. The solar arrays are drawn
      where they last reported; the Sun has moved about {drift}° since.
    </p>
  )
}
