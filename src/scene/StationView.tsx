/**
 * Close-up view of the station: NASA's model at scale, one unit per metre.
 *
 * The lighting follows the real position of the Sun in the station's frame, and fades as it enters
 * the Earth's shadow — which happens about sixteen times a day.
 *
 * The model weighs 14.9 MB, so the first view of it costs a few seconds. Rather than stand in a
 * simplified station, the view reports what it is doing and how far along it is: a placeholder
 * shape would be indistinguishable from the real thing at a glance, and worse than an honest wait.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import type { DirectionalLight, Group } from 'three'
import { useOrbitStore } from '../orbit/useOrbit'
import { sunDirectionLvlh } from '../orbit/propagator'
import { IssGltf } from './nasa/IssGltf'
import { useIssModel } from './nasa/useIssModel'
import { Atmosphere } from './Atmosphere'
import { EarthSurface } from './EarthSurface'
import { clampTarget, farPlane } from './cameraReach'
import { NightLights } from './NightLights'
import { Sky } from './Sky'
import { SunPointer } from './SunPointer'
import { FrozenJoints } from './FrozenJoints'

/** Distance to the Sun in the scene: far enough that its rays are parallel. */
const SUN_DISTANCE = 600

/** Furthest the camera may orbit the station. The far plane is derived from it. */
const MAX_CAMERA_DISTANCE = 400

/**
 * Keeps the pan from losing the station.
 *
 * All this used to do more: a polar limit recomputed every frame, because how far under the station
 * it was safe to swing depended on how far out the camera was. That was the seam between the
 * station's scale and the planet's, and the sky pass has since removed it — the camera cannot reach
 * the air from anywhere now. See cameraReach for what went and why. What remains is a radius on the
 * pan target, which is a matter of not losing sight of a 94-metre object, not of safety.
 */
function PanClamp() {
  const controls = useThree((three) => three.controls) as { target: Vector3 } | null

  // Priority −2, ahead of the controls' own update at −1: set it afterwards and the clamp applies
  // to the frame after the one that needed it.
  useFrame(() => {
    if (!controls) return
    const { target } = controls
    const [x, y, z] = clampTarget(target.x, target.y, target.z)
    target.set(x, y, z)
  }, -2)

  return null
}

/**
 * Development-only handle on the render loop.
 *
 * `requestAnimationFrame` does not run in a hidden tab, and a hidden tab is the normal state for a
 * browser driven by automation rather than by a person. The scene then holds its last frame while
 * every value it depends on goes stale — the joints keep old angles, the Sun sits at three.js's
 * default straight up — and a screenshot of that looks like a rendering, not like a stopped clock.
 * Measurements were taken from exactly that and reported as findings.
 *
 * `advance` runs one frame on demand: the same `useFrame` callbacks, the same draw. So the scene
 * can be checked without waiting on a scheduler that has no reason to tick.
 *
 * Never in a build — `import.meta.env.DEV` is statically false in production and the whole
 * component drops out.
 */
function FrameHandle() {
  const state = useThree()

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const handle = window as unknown as { __issScene?: unknown }
    handle.__issScene = state
    return () => {
      delete handle.__issScene
    }
  }, [state])

  return null
}



/**
 * Minimum lighting kept during shadow passes.
 *
 * The station spends about a third of every orbit in the Earth's shadow. Cutting all light would
 * be faithful, but would leave the user facing a black screen every other half-hour: a very faint
 * grazing light is kept so the silhouette stays readable.
 */
const NIGHT_FLOOR = 0.18

/**
 * The Sun's halo, as a falloff rather than as a stack of shells.
 *
 * It was three nested spheres at fixed opacity, which works while the Sun is a speck in the corner
 * of the frame and falls apart the moment it is not: each shell has a silhouette, and the outermost
 * one reads as the hard edge of a grey ball. That went unnoticed until the camera floor was removed
 * and the view could be swung underneath the station, where the halo fills a third of the frame.
 *
 * One sphere now, shaded by how far the fragment is from the centre of the disc — which is what a
 * halo is: light spread across the optics, densest at the source and trailing off. The exponent
 * sets how quickly, and 2.5 puts most of the brightness inside the first fifth of the radius while
 * leaving a visible glow to the edge, where it reaches zero and so has no silhouette at all.
 */
const GLOW_RADIUS = 105
const GLOW_FALLOFF = 2.5
const GLOW_STRENGTH = 0.55

/**
 * The Sun: the light, the disc it comes from, and the glow that makes it findable.
 *
 * The direction was already right — `sunDirectionLvlh` is checked against the beta angle computed
 * by an entirely separate route — but nothing on screen said where it was. A lit station with no
 * visible source leaves the reader to infer the geometry from the shading, which is exactly the
 * thing worth showing outright.
 *
 * Larger than life, and openly so: the real Sun would be 2.6 units across here. What is preserved
 * is the *direction*, which is the part that carries information.
 */
/**
 * The halo's falloff, painted once into a 128 px texture.
 *
 * A canvas gradient rather than a shader because that is all it is — a radial ramp — and a texture
 * costs one bind where a custom material costs a program. 128 px across a disc that is at most a
 * third of the screen is far below what the eye resolves in a smooth gradient.
 */
function useHaloTexture() {
  const gl = useThree((three) => three.gl)
  return useMemo(() => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    for (let i = 0; i <= 16; i += 1) {
      const t = i / 16
      gradient.addColorStop(t, `rgba(255, 233, 184, ${(GLOW_STRENGTH * (1 - t) ** GLOW_FALLOFF).toFixed(4)})`)
    }
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = gl.capabilities.getMaxAnisotropy()
    texture.needsUpdate = true
    return texture
  }, [gl])
}

function Sun() {
  const light = useRef<DirectionalLight>(null)
  const body = useRef<Group>(null)
  const haloTexture = useHaloTexture()

  useFrame(() => {
    const state = useOrbitStore.getState().state
    if (!state) return

    const [x, y, z] = sunDirectionLvlh(state, new Date())
    const at: [number, number, number] = [x * SUN_DISTANCE, y * SUN_DISTANCE, z * SUN_DISTANCE]

    if (light.current) {
      light.current.position.set(...at)
      light.current.intensity = 3.2 * (NIGHT_FLOOR + (1 - NIGHT_FLOOR) * (1 - state.shadow))
    }
    if (body.current) {
      body.current.position.set(...at)
      // Hidden in eclipse, because that is precisely what eclipse means: the Earth is in the way.
      body.current.visible = state.shadow < 0.5
    }
  })

  return (
    <>
      {/*
        The only shadow-casting light in the scene.
        
        The frustum is sized to the station itself — 94 m of truss, 73 m of arrays — because an
        orthographic shadow camera spends its whole resolution on whatever volume it is given, and
        a generous one would blur every edge it exists to draw. Half the diagonal of that footprint
        is 59.5 m, so ±62 covers every caster with a little to spare.
      */}
      <directionalLight
        ref={light}
        intensity={3.2}
        color="#fff6e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-62}
        shadow-camera-right={62}
        shadow-camera-top={62}
        shadow-camera-bottom={-62}
        shadow-camera-near={SUN_DISTANCE - 120}
        shadow-camera-far={SUN_DISTANCE + 120}
        shadow-bias={-0.0006}
      />

      <group ref={body}>
        <mesh>
          <sphereGeometry args={[13, 32, 32]} />
          {/* Unlit, and out of the tone mapper's reach so it clips to white like a real source. */}
          <meshBasicMaterial color="#fffdf5" toneMapped={false} />
        </mesh>
        {/* A billboard rather than a sphere: a halo has no shape of its own, and a sphere at this
            size was contributing one — its own silhouette. */}
        <sprite scale={[GLOW_RADIUS * 2, GLOW_RADIUS * 2, 1]}>
          <spriteMaterial
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            map={haloTexture}
          />
        </sprite>
      </group>
    </>
  )
}

/**
 * Earthshine: the planet below throwing sunlight back onto the station's belly.
 *
 * Real, and strong — the Earth reflects about a third of what hits it, and fills a third of the
 * sky from here. It is the reason the underside of the station is never truly black in orbital
 * photographs, and the reason the silhouette stays readable through an eclipse, where it is all
 * that is left.
 */
function EarthShine() {
  const light = useRef<DirectionalLight>(null)

  useFrame(() => {
    if (!light.current) return
    const shadow = useOrbitStore.getState().state?.shadow ?? 0
    light.current.intensity = 0.38 + 0.55 * shadow
  })

  // Coming from nadir: the Earth reflecting sunlight onto the belly of the station.
  return <directionalLight ref={light} position={[0, -200, 0]} intensity={0.38} color="#6f93c4" />
}

/**
 * What the canvas is, for a reader who cannot see it.
 *
 * It had no name at all: a screen reader met an unlabelled canvas and said nothing about the
 * largest thing on the page. `img` is the honest role — the scene needs a pointer to explore, and
 * everything it encodes (joint angles, array pointing, every reading) is already text in the
 * panels beside it. So the label describes the picture and says where the same facts are readable,
 * rather than pretending the geometry is navigable.
 */
const CANVAS_DESCRIPTION =
  'Three-dimensional view of the International Space Station, lit from the real Sun direction and ' +
  'seen against the Earth below. The same joint angles and readings are given as text in the ' +
  'panels beside it.'

export function StationView() {
  const { scene, loading, progress, error, retry } = useIssModel()
  // Mutated every frame from inside the Canvas; see SunPointer.
  const sunMarker = useRef<HTMLDivElement>(null)

  /*
   * The name goes on through a ref rather than as a prop or from `onCreated`.
   *
   * `Canvas` forwards neither `role` nor `aria-label` — measured, both the canvas and the wrapper
   * came back null. `onCreated` would work but only once a WebGL context exists, so the name would
   * be missing in exactly the situations where the scene fails to start. The ref points at the
   * canvas element itself and is set at mount, whatever the renderer goes on to do.
   */
  const canvas = useCallback((element: HTMLCanvasElement | null) => {
    if (!element) return
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', CANVAS_DESCRIPTION)
  }, [])

  return (
    <>
      {/* Shadows on: the solar wings shading the truss is the single largest gain in realism the
          scene can make, and it costs one shadow map. */}
      {/*
        Soft shadows and a slightly lifted exposure.
        
        `PCFSoft` costs a little and buys edges that are not staircases; the exposure compensates
        for the fill light that was just taken away, so the lit side keeps its brightness while
        the unlit side goes properly dark.

        The camera sits at 104 units, pulled in from 121 by the same 94/109 as the truss-length
        correction, so the station fills the same fraction of the frame as it did before the scale
        was fixed.
      */}
      <Canvas
        ref={canvas}
        shadows="soft"
        gl={{ toneMappingExposure: 1.15 }}
        camera={{ position: [60, 34, 78], fov: 42, near: 0.5, far: farPlane(MAX_CAMERA_DISTANCE) }}
        dpr={[1, 2]}
      >
        {/*
          Almost no fill, because there is almost none up there.
          
          Ambient 0.35 and hemisphere 0.4 were making every surface legible from every angle, which
          is comfortable and quite wrong: orbital photographs are brutally contrasty, one hard
          source and a black sky.
          
          Halving it is the single largest step towards looking like a photograph rather than a
          product render. Cutting it to a fifth was tried first and overshot — physically closer,
          and it left the shadow side unreadable, which matters in a tool whose whole purpose is
          inspecting the parts on that side. This is the compromise, stated rather than pretended
          away.
        */}
        <FrameHandle />

        {/*
          Fill light, and it stays out of the sky pass on purpose.

          These two exist to keep the station's shadow side readable, which is a stated compromise
          for a 94-metre object being inspected. On a planet they are simply wrong: nothing fills a
          planet's shading but the planet, and letting them through washed the ground out — the
          same square of Manitoba came off the texture at rgb(117,122,120) and out of the renderer
          at rgb(178,177,168), half again as bright and half as saturated. Earthshine is left out
          for the same reason twice over: it is the planet's own light, so lighting the planet with
          it counts it twice.
        */}
        <ambientLight intensity={0.16} color="#9fb6d0" />
        <hemisphereLight args={['#24425e', '#05080e', 0.22]} />
        <EarthShine />

        {/*
          Drawn in a pass of its own, from a camera that has barely moved — see Sky. The Sun is in
          here with the planet and the stars deliberately: it is the sky, and it is the one light
          that should reach both. Layers filter lights exactly as they filter geometry, so being
          inside this group is what makes it reach the planet at all.
        */}
        <Sky>
          <Sun />

          <EarthSurface />
          <NightLights />
          <Atmosphere />

          <Stars radius={800} depth={120} count={2500} factor={3} fade speed={0} />
        </Sky>

        <SunPointer target={sunMarker} />

        {scene && <IssGltf scene={scene} />}

        <OrbitControls
          enablePan
          minDistance={15}
          maxDistance={MAX_CAMERA_DISTANCE}
          target={[0, -3, 0]}
          makeDefault
        />
        <PanClamp />
      </Canvas>

      <FrozenJoints />

      {/* Sits over the canvas, moved by SunPointer. Hidden until the Sun leaves the frame. */}
      <div ref={sunMarker} className="sun-marker" aria-hidden="true">
        <span className="sun-marker__dot" />
        Sun
      </div>

      {loading && <ModelProgress progress={progress} />}
      {error && <ModelError message={error.message} onRetry={retry} />}
    </>
  )
}

function ModelProgress({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100)
  // Past the download, the file still has to be decompressed and uploaded to the GPU, which the
  // loader reports nothing about. Saying so beats a bar that sits at 100 % looking stuck.
  const decoding = percent >= 99

  return (
    <div className="model-progress">
      {/*
        The announcement and the number are deliberately separated.

        A live region around "Loading NASA model — 43%" is read again at every percentage point:
        sixty repetitions of the same sentence for one piece of news. The live region holds only
        the stage, which changes twice; the percentage sits beside it, hidden from the reader,
        where the progress bar it belongs to is also invisible to one.
      */}
      <span className="model-progress__label">
        <span role="status">{decoding ? 'Decoding geometry…' : 'Loading NASA model'}</span>
        {!decoding && <span aria-hidden="true"> — {percent}%</span>}
      </span>
      <span className="model-progress__track" aria-hidden="true">
        <span className="model-progress__bar" style={{ width: `${Math.max(percent, 2)}%` }} />
      </span>
      <span className="model-progress__note">14.9 MB · cached by the browser afterwards</span>
    </div>
  )
}

function ModelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    /*
     * `alert`, because it interrupts: the view the person just asked for is not going to appear,
     * and they need to know without being told to go and look.
     */
    <div className="scene-error" role="alert">
      <h2>Station model unavailable</h2>
      <p>
        The 3D model could not be loaded. The orbital view and every telemetry panel still work —
        only this view needs the file.
      </p>
      <pre>{message}</pre>
      {/*
        A retry, because the alternative was reloading the page — which throws away the telemetry
        session and the orbital state to recover from a dropped packet on a 15 MB download.
      */}
      <button type="button" className="scene-error__retry" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
