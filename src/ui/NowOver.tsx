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
import { useEffect, useMemo, useState } from 'react'
import { useOrbitStore } from '../orbit/useOrbit'
import { marineReady, overflightAt } from '../orbit/overflight'

export function NowOver() {
  const state = useOrbitStore((store) => store.state)

  // The sea outlines come as their own chunk, so the first answer over water would be "not known
  // yet". Re-render once when they land instead of waiting for the position to move.
  const [seasLoaded, setSeasLoaded] = useState(false)
  useEffect(() => {
    let live = true
    marineReady.then(() => live && setSeasLoaded(true))
    return () => {
      live = false
    }
  }, [])

  const latitudeKey = state ? Math.round(state.latitude * 10) : null
  const longitudeKey = state ? Math.round(state.longitude * 10) : null
  const overflight = useMemo(() => {
    if (latitudeKey === null || longitudeKey === null) return null
    // Read so this recomputes when the outlines land: until they do, the lookup answers null over
    // water and the line stays off rather than naming the sea wrongly for a moment.
    void seasLoaded
    return overflightAt(latitudeKey / 10, longitudeKey / 10)
  }, [latitudeKey, longitudeKey, seasLoaded])

  if (!overflight) return null

  /*
   * No caveat any more, because there is nothing left to excuse.
   *
   * This line used to carry a tooltip saying the sea names were regional approximations — which was
   * generous, since they were assigning the Gulf of Mexico to the Pacific. Both land and sea are now
   * point-in-polygon against real outlines, and the one case the data cannot name says so in the
   * words themselves rather than in a hover a touchscreen never shows.
   *
   * "the" for water and not for land: "over the Black Sea", "over France".
   */
  const label =
    overflight.kind === 'country'
      ? overflight.name
      : overflight.kind === 'water'
        ? 'open water'
        : `the ${overflight.name}`

  const source =
    overflight.kind === 'water'
      ? 'Real water, but no named area in Natural Earth’s marine set covers this point'
      : undefined

  return (
    <p className="now-over" title={source}>
      <span className="now-over__label">Now over</span> <strong>{label}</strong>
    </p>
  )
}
