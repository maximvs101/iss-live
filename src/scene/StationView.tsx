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
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { AdditiveBlending, BackSide } from 'three'
import type { DirectionalLight, Mesh } from 'three'
import { useOrbitStore } from '../orbit/useOrbit'
import { sunDirectionLvlh } from '../orbit/propagator'
import { IssGltf } from './nasa/IssGltf'
import { useIssModel } from './nasa/useIssModel'
import { EARTH_CENTRE, EARTH_RADIUS } from './earthLimb'

/** Distance to the Sun in the scene: far enough that its rays are parallel. */
const SUN_DISTANCE = 600



/**
 * Minimum lighting kept during shadow passes.
 *
 * The station spends about a third of every orbit in the Earth's shadow. Cutting all light would
 * be faithful, but would leave the user facing a black screen every other half-hour: a very faint
 * grazing light is kept so the silhouette stays readable.
 */
const NIGHT_FLOOR = 0.18

/**
 * The Sun: the light, and now the disc it comes from.
 *
 * The direction was already right — `sunDirectionLvlh` is checked against the beta angle computed
 * by an entirely separate route — but nothing on screen said where it was. A lit station with no
 * visible source leaves the reader to infer the geometry from the shading, which is exactly the
 * thing worth showing outright.
 *
 * The disc is drawn larger than life. At this distance the real Sun subtends half a degree, about
 * 2.6 units across, which reads as a speck; 9 keeps it a recognisable body without pretending to
 * be an angular measurement.
 */
function Sun() {
  const light = useRef<DirectionalLight>(null)
  const disc = useRef<Mesh>(null)

  useFrame(() => {
    const state = useOrbitStore.getState().state
    if (!state) return

    const [x, y, z] = sunDirectionLvlh(state, new Date())
    const at: [number, number, number] = [x * SUN_DISTANCE, y * SUN_DISTANCE, z * SUN_DISTANCE]

    if (light.current) {
      light.current.position.set(...at)
      light.current.intensity = 3.2 * (NIGHT_FLOOR + (1 - NIGHT_FLOOR) * (1 - state.shadow))
    }
    if (disc.current) {
      disc.current.position.set(...at)
      // Hidden in eclipse, because that is precisely what eclipse means: the Earth is in the way.
      disc.current.visible = state.shadow < 0.5
    }
  })

  return (
    <>
      {/*
        The only shadow-casting light in the scene.
        
        The frustum is sized to the station itself — 109 m of truss, 74 m of modules — because an
        orthographic shadow camera spends its whole resolution on whatever volume it is given, and
        a generous one would blur every edge it exists to draw.
      */}
      <directionalLight
        ref={light}
        intensity={3.2}
        color="#fff6e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={SUN_DISTANCE - 120}
        shadow-camera-far={SUN_DISTANCE + 120}
        shadow-bias={-0.0006}
      />

      <mesh ref={disc}>
        <sphereGeometry args={[9, 24, 24]} />
        {/* Unlit: a light source lit by other lights would be a contradiction. */}
        <meshBasicMaterial color="#fff4d6" toneMapped={false} />
      </mesh>
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

      {/* Atmosphere: a slightly larger shell seen from inside, glowing where it is edge-on. The
          limb is the only place a 40 km layer is thick enough to see, and this is what puts it
          there. */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.025, 64, 48]} />
        <meshBasicMaterial
          color="#5aa9e6"
          transparent
          opacity={0.18}
          side={BackSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/** Fill light standing in for earthshine, strengthened when the station is in shadow. */
function EarthShine() {
  const light = useRef<DirectionalLight>(null)

  useFrame(() => {
    if (!light.current) return
    const shadow = useOrbitStore.getState().state?.shadow ?? 0
    light.current.intensity = 0.35 + 0.5 * shadow
  })

  // Coming from nadir: the Earth reflecting sunlight onto the belly of the station.
  return <directionalLight ref={light} position={[0, -200, 0]} intensity={0.35} color="#6f93c4" />
}

export function StationView() {
  const { scene, loading, progress, error } = useIssModel()

  return (
    <>
      {/* Shadows on: the solar wings shading the truss is the single largest gain in realism the
          scene can make, and it costs one shadow map. */}
      <Canvas shadows camera={{ position: [70, 40, 90], fov: 42, near: 0.5, far: 4000 }} dpr={[1, 2]}>
        <color attach="background" args={['#05070c']} />
        <ambientLight intensity={0.35} color="#9fb6d0" />
        <hemisphereLight args={['#2a4a6a', '#0a0f18', 0.4]} />
        <Sun />
        <EarthShine />

        <Earth />

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
