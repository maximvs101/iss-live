/**
 * What the map says, for a reader who cannot see it.
 *
 * The map is an `<svg role="img">`, and that role makes it a **leaf** in the accessibility tree:
 * every `<title>` inside it — the station's position, the subsolar point, the times along the
 * track — is collapsed away and never announced. A screen reader heard one fixed
 * sentence about a map that changes every second. The drawing cannot carry the data, so a live
 * region beside it does.
 *
 * Announced on a **timer, not on every change**. The position updates once a second; a polite live
 * region fed at that rate would talk over itself indefinitely and drown out the rest of the page.
 * Thirty seconds is roughly two degrees of latitude — often enough to follow the station, rare
 * enough to be bearable.
 */
import { useEffect, useState } from 'react'
import { useOrbitStore } from '../../orbit/useOrbit'
import { overflightAt } from '../../orbit/overflight'

/** How often the sentence is refreshed. */
const SPEAK_EVERY_MS = 30_000

const coordinate = (value: number, positive: string, negative: string) =>
  `${Math.abs(value).toFixed(1)} degrees ${value >= 0 ? positive : negative}`

/** The sentence, built from whatever the stores hold at the moment it is called. */
function describe(): string {
  const { state } = useOrbitStore.getState()
  if (!state) return 'Waiting for orbital elements.'

  const under = overflightAt(state.latitude, state.longitude)
  // Spelled out — "43.4° N" is read as "43.4 N" by most screen readers, which is not a latitude.
  const where = `${coordinate(state.latitude, 'north', 'south')}, ${coordinate(state.longitude, 'east', 'west')}`
  // Null while the sea outlines are still loading. The clause is dropped rather than filled with a
  // placeholder: a screen reader hearing "over open water" over the Black Sea is worse than one
  // hearing a position and nothing else.
  const over =
    under === null
      ? null
      : under.kind === 'country'
        ? `over ${under.name}`
        : under.kind === 'water'
          ? 'over open water'
          : `over the ${under.name}`
  const lit = state.shadow < 0.5 ? 'in sunlight' : 'in the Earth’s shadow'

  return `Station at ${where}${over ? `, ${over}` : ''}, ${lit}.`
}

export function MapAnnouncement() {
  const [sentence, setSentence] = useState(describe)
  /**
   * Whether an orbit has been computed at all — not the position itself, which changes every
   * second and would defeat the timer this component exists to impose.
   */
  const ready = useOrbitStore((store) => store.state !== null)

  // The first render happens before the elements have loaded, so the opening sentence is "waiting".
  // Without this the timer would leave it there for a full thirty seconds after the answer arrived.
  useEffect(() => setSentence(describe()), [ready])

  useEffect(() => {
    const timer = setInterval(() => setSentence(describe()), SPEAK_EVERY_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <p className="visually-hidden" aria-live="polite">
      {sentence}
    </p>
  )
}
