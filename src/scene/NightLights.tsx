/**
 * Cities on the dark side.
 *
 * The Earth in this scene is deliberately unmarked, and the reason given for that still holds: a
 * basemap stretched over a sphere this size would invite reading a geography it cannot support.
 * Night lights are a different proposition, and it is worth being precise about why rather than
 * treating the earlier decision as overturned.
 *
 * They are point sources, so softness reads as bloom rather than as blur — which is also what a
 * long exposure from the cupola actually looks like. And the texture is 0.1° per pixel, about 11 km
 * at the equator, roughly 200 pixels across the ground the station can see at once. That is enough
 * to show that a coastline is inhabited and where the dark is empty. It is not enough to find a
 * city, and nothing here invites the attempt: no labels, no borders, no daylight terrain.
 *
 * Additive and masked to the night side, so it adds light where the Sun does not and vanishes
 * entirely where it does. The mask runs off the same solar vector as everything else in the scene,
 * so the lights stop exactly where the terminator on the ground is, not near it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Matrix3, SRGBColorSpace, TextureLoader, type Texture, Vector3 } from 'three'
import { useOrbitStore } from '../orbit/useOrbit'
import { earthOrientationLvlh, sunDirectionLvlh } from '../orbit/propagator'
import { EARTH_CENTRE, EARTH_RADIUS } from './earthLimb'

/** NASA's Black Marble, 2016. Loaded once the station view is open, never before. */
const TEXTURE = `${import.meta.env.BASE_URL}textures/earth-night.jpg`

const vertexShader = /* glsl */ `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uLights;
  uniform mat3 uOrientation;
  uniform vec3 uSunDirection;
  uniform float uStrength;

  varying vec3 vLocalPosition;

  const float PI = 3.141592653589793;

  void main() {
    // The sphere is centred on the planet, so its local position is already the outward normal.
    vec3 up = normalize(vLocalPosition);

    // Night only, and the edge of it is the terminator. Slightly soft, because the real one is:
    // twilight reaches a good way past the geometric line.
    float night = smoothstep(0.10, -0.18, dot(up, uSunDirection));
    if (night <= 0.0) discard;

    // Into the frame the map is drawn in, then straight to latitude and longitude. Done here
    // rather than through the geometry's own texture coordinates so the convention is written
    // down rather than assumed.
    vec3 earth = uOrientation * up;
    float latitude = asin(clamp(earth.y, -1.0, 1.0));
    // Negated, because +Z runs through 90° *west*. See geocentric in earthOrientation for why the
    // frame is built that way, and what a left-handed one silently does to the map.
    float longitude = atan(-earth.z, earth.x);
    vec2 uv = vec2(longitude / (2.0 * PI) + 0.5, latitude / PI + 0.5);

    vec3 lights = texture2D(uLights, uv).rgb;
    gl_FragColor = vec4(lights * night * uStrength, 1.0);
  }
`

export function NightLights() {
  const [texture, setTexture] = useState<Texture | null>(null)
  const orientation = useRef(new Matrix3())
  const sun = useMemo(() => new Vector3(0, 1, 0), [])

  useEffect(() => {
    let live = true
    const loader = new TextureLoader()
    loader.load(TEXTURE, (loaded) => {
      if (!live) {
        loaded.dispose()
        return
      }
      // Black Marble is an sRGB image; without this the lights come out washed and grey.
      loaded.colorSpace = SRGBColorSpace
      setTexture(loaded)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => () => texture?.dispose(), [texture])

  // Rebuilt when the texture arrives rather than filled in afterwards. Mutating a uniform that the
  // material may or may not still be holding is the kind of thing that works until it does not,
  // and the mesh does not exist before the texture does, so there is nothing to fill in.
  const uniforms = useMemo(
    () => ({
      uLights: { value: texture },
      uOrientation: { value: orientation.current },
      uSunDirection: { value: sun },
      uStrength: { value: 1.6 },
    }),
    [sun, texture],
  )

  useFrame(() => {
    const { state } = useOrbitStore.getState()
    if (!state) return

    const now = new Date()
    sun.set(...sunDirectionLvlh(state, now))
    orientation.current.fromArray(earthOrientationLvlh(state, now))
  })

  if (!texture) return null

  return (
    <mesh position={[0, -EARTH_CENTRE, 0]}>
      {/* A hair above the surface, so it never fights the planet for the same depth. */}
      <sphereGeometry args={[EARTH_RADIUS * 1.0004, 96, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}
