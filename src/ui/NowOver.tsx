/**
 * Where the station is, in words, in the header.
 *
 * It began at the top of the orbital panel, which is the wrong place for it twice over: the panel
 * is only on screen in one of the two views, and "over the Coral Sea" is the single line on the
 * page that a passer-by reads without knowing anything about the rest. Latitude and longitude tell
 * you where the station is; this tells you what it is above, and it belongs where the title is.
 *
 * The lookup is the same one it always used, rounded to a tenth of a degree — about 11 km, finer
 * than the 110 m country outlines resolve and coarse enough that the answer only changes when it
 * means something.
 */
import { useMemo } from 'react'
import { useOrbitStore } from '../orbit/useOrbit'
import { overflightAt } from '../orbit/overflight'

export function NowOver() {
  const state = useOrbitStore((store) => store.state)

  const latitudeKey = state ? Math.round(state.latitude * 10) : null
  const longitudeKey = state ? Math.round(state.longitude * 10) : null
  const overflight = useMemo(
    () =>
      latitudeKey === null || longitudeKey === null
        ? null
        : overflightAt(latitudeKey / 10, longitudeKey / 10),
    [latitudeKey, longitudeKey],
  )

  if (!overflight) return null

  return (
    <p className="now-over">
      <span className="now-over__label">Now over</span>{' '}
      <strong>{overflight.name}</strong>
      {overflight.kind === 'ocean' && (
        <span
          className="now-over__note"
          title="Sea areas are named by region rather than looked up from geometry, so this is approximate"
        >
          {' '}
          (approximate)
        </span>
      )}
    </p>
  )
}
