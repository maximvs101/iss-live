/**
 * Where the station is, in words: the first cell of the state band.
 *
 * It began at the top of the orbital panel, which was the wrong place for it twice over: the panel
 * is only on screen in one of the two views, and "over the Coral Sea" is the single line on the
 * page that a passer-by reads without knowing anything about the rest. It moved up beside the
 * title, and it sat there directly against the words ISS LIVE with nothing between them, so the
 * two ran together as one line of prose. It now opens the band, which is where it belongs on the
 * merits rather than for want of room: latitude and longitude are two cells to its right, and this
 * is the same reading said in words.
 *
 * Wider and a size up on the cells beside it — it is a name, not a figure, and it is the one thing
 * here a reader who knows nothing about the rest of the page can use.
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
  const label = !overflight
    ? '—'
    : overflight.kind === 'country'
      ? overflight.name
      : overflight.kind === 'water'
        ? 'open water'
        : `the ${overflight.name}`

  const source =
    overflight?.kind === 'water'
      ? 'Real water, but no named area in Natural Earth’s marine set covers this point'
      : undefined

  /*
   * An em dash rather than nothing, until the lookup answers.
   *
   * The line used to disappear while the outlines loaded, which is right for a line in a header
   * and wrong for a cell in a band: every cell beside it would then shift left and settle back a
   * moment later, and a strip whose cells move is a strip nobody learns to read.
   */
  return (
    <div className="console-strip__cell console-strip__cell--over" title={source}>
      <dt>Over</dt>
      <dd className="console-strip__value console-strip__value--place">{label}</dd>
    </div>
  )
}
