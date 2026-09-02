/**
 * Says where the Sun is when it is not on screen.
 *
 * The disc and its halo are drawn at the real solar direction, and that turned out not to be
 * enough to *find* it: the Sun occupies a fraction of a degree inside a 42° field, so it is out of
 * frame most of the time and there is nothing to tell you which way to turn. Lighting alone leaves
 * the reader to infer the geometry from which panels are bright, which is the inference this whole
 * feature exists to spare them.
 *
 * So: a marker pinned to the edge of the view, in the direction of the Sun, whenever the Sun is
 * outside it. When it comes into frame the marker disappears, because by then the halo is doing
 * the job better.
 *
 * Positioned by mutating the DOM node directly rather than through React state. This runs on every
 * frame, and a `setState` at 60 Hz would re-render the tree sixty times a second to move one
 * element a few pixels.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useMemo, type RefObject } from 'react'
import { useOrbitStore } from '../orbit/useOrbit'
import { markerPlacement } from './sunMarker'
import { sunDirectionLvlh } from '../orbit/propagator'

/** Distance to the Sun in the scene. Matches StationView; only the direction matters here. */
const SUN_DISTANCE = 600

/** Keeps the marker clear of the very corner, where it would sit half under the panel edges. */
const MARGIN = 0.88

export function SunPointer({ target }: { target: RefObject<HTMLDivElement | null> }) {
  const camera = useThree((three) => three.camera)
  const size = useThree((three) => three.size)
  /*
   * Three scratch vectors, allocated once.
   *
   * `applyMatrix4` and `project` both mutate their receiver, so the loop was cloning twice a
   * frame and rebuilding `at` on every render of the view above it — a hundred and twenty short
   * lived vectors a second, in the one function that runs on every frame. The rest of this
   * directory already keeps its scratch in a memo: `NightLights`, `Atmosphere`, `EarthSurface`.
   */
  const scratch = useMemo(
    () => ({ at: new Vector3(), cameraSpace: new Vector3(), ndc: new Vector3() }),
    [],
  )

  useFrame(() => {
    const node = target.current
    if (!node) return

    const state = useOrbitStore.getState().state
    if (!state) return

    // In eclipse there is nothing to point at: the Earth is between the station and the Sun.
    if (state.shadow >= 0.5) {
      node.style.opacity = '0'
      return
    }

    const [x, y, z] = sunDirectionLvlh(state, new Date())
    // Measured from the camera, not from the origin, because that is where the disc appears. The
    // Sun is drawn in the sky pass, whose camera sits at the station whatever the real one is
    // doing, so the disc holds the true solar direction from wherever you are looking. Projecting
    // a fixed point 600 units from the *origin* instead put the marker up to 41.8° out at the far
    // end of the orbit — pointing confidently at nothing.
    const at = scratch.at.set(x, y, z).multiplyScalar(SUN_DISTANCE).add(camera.position)

    // In camera space first: `project` alone cannot tell a point in front from one behind.
    const behind = scratch.cameraSpace.copy(at).applyMatrix4(camera.matrixWorldInverse).z > 0
    const ndc = scratch.ndc.copy(at).project(camera)
    const place = markerPlacement(ndc.x, ndc.y, behind, MARGIN)

    if (!place.visible) {
      node.style.opacity = '0'
      return
    }

    node.style.opacity = '1'
    node.style.left = `${place.x * size.width}px`
    node.style.top = `${place.y * size.height}px`
  })

  return null
}
