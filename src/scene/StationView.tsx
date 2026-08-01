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
import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { AdditiveBlending } from 'three'
import type { DirectionalLight, Group } from 'three'
import { useOrbitStore } from '../orbit/useOrbit'
import { sunDirectionLvlh } from '../orbit/propagator'
import { IssGltf } from './nasa/IssGltf'
import { useIssModel } from './nasa/useIssModel'
import { EARTH_CENTRE, EARTH_RADIUS } from './earthLimb'
import { Atmosphere } from './Atmosphere'
import { NightLights } from './NightLights'
import { SunPointer } from './SunPointer'
import { FrozenJoints } from './FrozenJoints'

/** Distance to the Sun in the scene: far enough that its rays are parallel. */
const SUN_DISTANCE = 600

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
 * Nested additive shells standing in for a glow.
 *
 * The bare disc was there and nobody found it: at 600 units the Sun subtends half a degree inside
 * a 42° field, so it is in frame perhaps one time in six and reads as a speck when it is. A halo
 * an order of magnitude wider is what makes a bright source legible — real optics spread it across
 * the lens, and every photograph of the Sun anyone has seen is mostly halo.
 *
 * Additive and depth-write-off, so the shells brighten whatever they overlap instead of stacking
 * into a grey ball, and so the outermost one does not occlude the core.
 */
const GLOW = [
  { radius: 26, opacity: 0.5 },
  { radius: 52, opacity: 0.22 },
  { radius: 105, opacity: 0.09 },
]

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
function Sun() {
  const light = useRef<DirectionalLight>(null)
  const body = useRef<Group>(null)

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
        {GLOW.map((shell) => (
          <mesh key={shell.radius}>
            <sphereGeometry args={[shell.radius, 24, 24]} />
            <meshBasicMaterial
              color="#ffe9b8"
              transparent
              opacity={shell.opacity}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </>
  )
}

/**
 * The planet the station is falling around.
 *
 * Deliberately unmarked — no coastlines, no cloud. This is a horizon, not a globe: the map view
 * already answers *where*, and a low-resolution texture stretched over a sphere this size would
 * invite a reading of the geography it cannot support. What it gives is the one thing the scene
 * lacked: somewhere for the station to be, and a terminator on the ground that agrees with the
 * terminator on the station, because both come from the same light.
 *
 * The air above it is a separate component, because it is a different kind of object: this sphere
 * is a surface and is shaded like one, while the limb is a length of nothing that happens to be
 * lit. See Atmosphere.
 */
function Earth() {
  return (
    <group position={[0, -EARTH_CENTRE, 0]}>
      {/* Neither casting nor receiving: it sits far outside the shadow camera's frustum, which is
          sized to the station, and asking for either would only spend resolution on nothing. */}
      <mesh castShadow={false} receiveShadow={false}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 48]} />
        <meshStandardMaterial color="#1b4f7a" roughness={0.95} metalness={0} />
      </mesh>

    </group>
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

export function StationView() {
  const { scene, loading, progress, error } = useIssModel()
  // Mutated every frame from inside the Canvas; see SunPointer.
  const sunMarker = useRef<HTMLDivElement>(null)

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
        shadows="soft"
        gl={{ toneMappingExposure: 1.15 }}
        camera={{ position: [60, 34, 78], fov: 42, near: 0.5, far: 4000 }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#04060b']} />
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
        <ambientLight intensity={0.16} color="#9fb6d0" />
        <hemisphereLight args={['#24425e', '#05080e', 0.22]} />
        <FrameHandle />
        <Sun />
        <EarthShine />

        <Earth />
        <NightLights />
        <Atmosphere />
        <SunPointer target={sunMarker} />

        {scene && <IssGltf scene={scene} />}

        <Stars radius={800} depth={120} count={2500} factor={3} fade speed={0} />

        <OrbitControls
          enablePan
          minDistance={15}
          maxDistance={400}
          target={[0, -3, 0]}
          makeDefault
        />
      </Canvas>

      <FrozenJoints />

      {/* Sits over the canvas, moved by SunPointer. Hidden until the Sun leaves the frame. */}
      <div ref={sunMarker} className="sun-marker" aria-hidden="true">
        <span className="sun-marker__dot" />
        Sun
      </div>

      {loading && <ModelProgress progress={progress} />}
      {error && <ModelError message={error.message} />}
    </>
  )
}

function ModelProgress({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100)
  // Past the download, the file still has to be decompressed and uploaded to the GPU, which the
  // loader reports nothing about. Saying so beats a bar that sits at 100 % looking stuck.
  const stage = percent >= 99 ? 'Decoding geometry…' : `Loading NASA model — ${percent}%`

  return (
    <div className="model-progress">
      <span className="model-progress__label">{stage}</span>
      <span className="model-progress__track">
        <span className="model-progress__bar" style={{ width: `${Math.max(percent, 2)}%` }} />
      </span>
      <span className="model-progress__note">14.9 MB · cached by the browser afterwards</span>
    </div>
  )
}

function ModelError({ message }: { message: string }) {
  return (
    <div className="scene-error">
      <h2>Station model unavailable</h2>
      <p>
        The 3D model could not be loaded. The orbital view and every telemetry panel still work —
        only this view needs the file.
      </p>
      <pre>{message}</pre>
    </div>
  )
}
