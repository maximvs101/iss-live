/**
 * The planet, with continents on it.
 *
 * This reverses a decision, so it is worth saying which one and why. The sphere was deliberately
 * unmarked, on the argument that a texture at this scale invites reading a geography it cannot
 * support and that the map view already answers *where*. That argument was sound while the sphere
 * was bare on both sides. It stopped being sound once city lights went on the night side: half the
 * planet then carried geography and half was flat paint, and the seam between them at the
 * terminator was the least defensible thing in the scene.
 *
 * So the day side gets Blue Marble — NASA's cloud-free composite, chosen for the same property that
 * makes Black Marble work at night: **no lighting is baked into it**. The scene has its own Sun,
 * computed from the same vector that lights the station, and a texture carrying someone else's
 * would fight it. That is the whole reason weather imagery is the wrong tool here and these two
 * are the right one.
 *
 * Three layers, drawn outward: the surface, the clouds, and — in NightLights, because it is
 * additive and belongs after everything — the cities.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Group,
  Matrix3,
  Matrix4,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three'
import { useOrbitStore } from '../orbit/useOrbit'
import { earthOrientationLvlh } from '../orbit/propagator'
import { EARTH_CENTRE, EARTH_RADIUS } from './earthLimb'

const TEXTURE = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`

/**
 * Height of the cloud deck, scaled with the planet like everything else.
 *
 * 12 km is the top of the troposphere at the equator, which is where the tall weather stops. On
 * this sphere that is 3.4 units — invisible as a gap, which is right: from 420 km the clouds sit on
 * the ground, and their height shows only in the shadows they cast, which this does not attempt.
 */
const CLOUD_TOP_KM = 12
const CLOUD_RADIUS = EARTH_RADIUS * ((6371 + CLOUD_TOP_KM) / 6371)

/** Loads a texture once, tags it sRGB, and disposes it on the way out. */
function useSurfaceTexture(name: string, colour = true): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null)

  useEffect(() => {
    let live = true
    new TextureLoader().load(TEXTURE(name), (loaded) => {
      if (!live) {
        loaded.dispose()
        return
      }
      // Colour maps are sRGB; the roughness map is data and must not be decoded as if it were not.
      if (colour) loaded.colorSpace = SRGBColorSpace
      setTexture(loaded)
    })
    return () => {
      live = false
    }
  }, [name, colour])

  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

export function EarthSurface() {
  const group = useRef<Group>(null)
  const day = useSurfaceTexture('earth-day.jpg')
  const roughness = useSurfaceTexture('earth-roughness.jpg', false)
  const clouds = useSurfaceTexture('earth-clouds.jpg')

  const scratch = useMemo(() => ({ matrix: new Matrix3(), full: new Matrix4() }), [])

  useFrame(() => {
    const node = group.current
    if (!node) return
    const { state } = useOrbitStore.getState()
    if (!state) return

    // The orientation maps a scene direction into the planet's frame; the mesh needs the opposite,
    // since its own coordinates *are* that frame. For a rotation the inverse is the transpose —
    // which only holds because the frame is right-handed, and did not before that was fixed.
    scratch.matrix.fromArray(earthOrientationLvlh(state, new Date()))
    scratch.full.setFromMatrix3(scratch.matrix).transpose()
    node.quaternion.setFromRotationMatrix(scratch.full)
  })

  return (
    <group position={[0, -EARTH_CENTRE, 0]}>
      <group ref={group}>
        {/* Neither casting nor receiving: it sits far outside the shadow camera's frustum, which is
            sized to the station, and asking for either would only spend resolution on nothing. */}
        <mesh castShadow={false} receiveShadow={false}>
          <sphereGeometry args={[EARTH_RADIUS, 128, 96]} />
          {/*
            Dielectric, so metalness stays 0: water reflects about 2 % head-on and everything at a
            grazing angle, which is what the standard material's Fresnel already does.

            `roughness` is 1 because three.js multiplies it by the map, and the map carries the real
            value — sea where the water is, near-matte everywhere else. See build:earth for how it
            is derived from the colour image, and oceanGlint for where the sea's figure comes from.
          */}
          <meshStandardMaterial
            map={day ?? undefined}
            roughnessMap={roughness ?? undefined}
            color={day ? '#ffffff' : '#1b4f7a'}
            roughness={roughness ? 1 : 0.528}
            metalness={0}
          />
        </mesh>

        {clouds && (
          /*
           * Clouds, and an honest label: this is a cloud *field*, not today's weather. It is NASA's
           * Blue Marble composite, which is a month of observations averaged into something that
           * looks like a sky. Nothing in this app invents data, so it must not be read as a
           * forecast — hence the note in the README and the deliberate absence of any claim in the
           * interface that it is current.
           *
           * Lit by the scene's own Sun like everything else, so the terminator runs across the
           * cloud tops exactly where it runs across the ground.
           */
          <mesh castShadow={false} receiveShadow={false}>
            <sphereGeometry args={[CLOUD_RADIUS, 96, 64]} />
            <meshStandardMaterial
              map={clouds}
              alphaMap={clouds}
              transparent
              depthWrite={false}
              roughness={1}
              metalness={0}
            />
          </mesh>
        )}
      </group>
    </group>
  )
}
