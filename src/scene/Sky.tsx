/**
 * Everything that is not the station, drawn from a camera that has barely moved.
 *
 * The scene holds two scales at once — a metre to the unit for the station, three and a half
 * kilometres for the planet — and a single camera cannot serve both. Pull back 400 units to look at
 * a 94-metre object and the planet reads the move as four hundred metres *of its own units*, which
 * is fourteen hundred kilometres: the horizon closes from 69.7° to 50.9°, the star field swings
 * through 30°, and the Sun's disc slides 41.8° away from the light it is supposed to be casting.
 *
 * So the sky gets its own pass. Same orientation, same field of view, and the camera's offset
 * converted to the planet's units before it is applied: 400 units becomes 0.113. Then the depth
 * buffer is thrown away and the station is drawn over the top, at its own scale, from its own
 * camera. See distantScene for why that is the true parallax rather than a suppression of it, and
 * why it cannot be done by moving the planet instead.
 *
 * **Lights inside here light both passes.** Layers filter lights exactly as they filter geometry,
 * so a light moved onto the sky's layer would stop reaching the station entirely — which is why
 * they are *enabled* on it rather than moved to it.
 *
 * Which makes what is *not* in here a decision rather than an oversight. Only the Sun is: it is the
 * one light that genuinely falls on both. The ambient and hemisphere fills stay outside, because
 * they exist to keep the station's shadow side legible and a planet has no such excuse — passing
 * them through washed the ground half again as bright and half as saturated as the texture it came
 * from. Earthshine stays outside twice over, being the planet's own light bounced back.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, PerspectiveCamera } from 'three'
import type { Group, Light } from 'three'
import { DISTANT_FAR, DISTANT_LAYER, DISTANT_NEAR, PARALLAX_SCALE } from './distantScene'

/**
 * The colour behind everything.
 *
 * Set on the renderer rather than as `scene.background`, and that is not a preference. A background
 * on the scene makes three.js clear the colour buffer at the start of **every** render call, which
 * with two calls a frame would wipe the sky the instant the station was drawn over it.
 */
const BACKGROUND = new Color('#04060b')

export function Sky({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null)
  const gl = useThree((three) => three.gl)
  const scene = useThree((three) => three.scene)
  const camera = useThree((three) => three.camera)

  const far = useMemo(() => new PerspectiveCamera(), [])

  useEffect(() => {
    far.layers.set(DISTANT_LAYER)
    camera.layers.disable(DISTANT_LAYER)

    // Both passes share one colour buffer and must not share a depth buffer, so the clearing is
    // done by hand — which means the background has to be as well.
    gl.autoClear = false
    gl.setClearColor(BACKGROUND, 1)

    // One shadow map per frame instead of one per render call. Without this the 2048² map is drawn
    // twice over, for a second pass that has no shadow receivers in it at all.
    gl.shadowMap.autoUpdate = false

    return () => {
      gl.autoClear = true
      gl.shadowMap.autoUpdate = true
      camera.layers.enable(DISTANT_LAYER)
    }
  }, [camera, far, gl])

  /*
   * Priority 1, which is what taking over the render loop means: react-three-fiber stops drawing on
   * its own as soon as any subscriber asks for a priority above zero. Everything else in the scene
   * runs at zero or below and has therefore already moved before a pixel is drawn.
   */
  useFrame(() => {
    const root = group.current
    if (root) {
      // Done every frame rather than once on mount, because the things in here appear late and at
      // their own pace: the planet's textures arrive over the network, and a mesh that misses its
      // marking is a mesh drawn in the near pass, at the wrong scale, in front of the station.
      root.traverse((object) => {
        if ((object as Light).isLight) object.layers.enable(DISTANT_LAYER)
        else if (object.layers.mask !== 1 << DISTANT_LAYER) object.layers.set(DISTANT_LAYER)
      })
    }

    gl.clear(true, true, true)

    far.position.copy(camera.position).multiplyScalar(PARALLAX_SCALE)
    far.quaternion.copy(camera.quaternion)
    far.fov = (camera as PerspectiveCamera).fov
    far.aspect = (camera as PerspectiveCamera).aspect
    far.near = DISTANT_NEAR
    far.far = DISTANT_FAR
    far.updateProjectionMatrix()
    far.updateMatrixWorld()

    // Ahead of the first render rather than between the two, so the map is current for both and
    // neither pass compiles a material against a shadow map that does not exist yet.
    gl.shadowMap.needsUpdate = true
    gl.render(scene, far)

    gl.clearDepth()
    gl.render(scene, camera)
  }, 1)

  return <group ref={group}>{children}</group>
}
