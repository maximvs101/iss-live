/**
 * The blue arc on the horizon.
 *
 * It was a shell of flat blue before, evenly bright all the way round, which reads as a rim light
 * on a ball rather than as air. Three things separate the two in a photograph, and all three come
 * out of one calculation:
 *
 *   - the band is brightest **exactly** at the ground and fades upward, because brightness follows
 *     how far the ray travels through air, and that collapses as the ray climbs;
 *   - it goes **orange** where the Sun is low, because that is the same light and the same reason
 *     as a sunset — the blue has already scattered out of it;
 *   - it stops at the terminator, because unlit air is not a light source.
 *
 * So rather than shade the shell, this shades the **ray**. For each pixel, take the line from the
 * camera through it, find how close that line passes to the Earth's centre, and the rest follows in
 * closed form. The geometry is a rasterisation stencil and nothing more, which is why its radius
 * can change without the appearance changing.
 *
 * Drawn back-face-first with the planet already in the depth buffer, so the only pixels that
 * survive are the ones whose ray misses the ground: the annulus between the surface and the top of
 * the air. Rays that *do* hit the ground would carry haze too, and that is left out — it belongs on
 * the surface, not on this shell, and adding it here would double it.
 *
 * The shading itself is in limbScattering, where it can be tested.
 */
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, FrontSide, Vector3 } from 'three'
import { useOrbitStore } from '../orbit/useOrbit'
import { sunDirectionLvlh } from '../orbit/propagator'
import { ATMOSPHERE_RADIUS, EARTH_CENTRE, EARTH_RADIUS, LIMB_CHORD } from './earthLimb'
import { fragmentShader, hazeFragmentShader, vertexShader } from './limbScattering'

/** World position of the planet's centre. The scene puts the station at the origin. */
const CENTRE = new Vector3(0, -EARTH_CENTRE, 0)

/**
 * Where the haze shell sits.
 *
 * Above the cloud tops at 1803.4, so distant cloud is hazed along with distant ground — which is
 * what a photograph shows — and well inside the limb shell at 1828.25. Nothing about the shading
 * depends on this number: it is a surface to rasterise, and the shader works from the ray.
 */
const HAZE_RADIUS = 1806

export function Atmosphere() {
  const sun = useMemo(() => new Vector3(0, 1, 0), [])

  const uniforms = useMemo(
    () => ({
      uEarthCentre: { value: CENTRE },
      uSunDirection: { value: sun },
      uAtmosphereRadius: { value: ATMOSPHERE_RADIUS },
      uLimbChord: { value: LIMB_CHORD },
    }),
    [sun],
  )

  const hazeUniforms = useMemo(
    () => ({
      uEarthCentre: { value: CENTRE },
      uSunDirection: { value: sun },
      uSurfaceRadius: { value: EARTH_RADIUS },
      uAtmosphereRadius: { value: ATMOSPHERE_RADIUS },
      uBandDepth: { value: ATMOSPHERE_RADIUS - EARTH_RADIUS },
    }),
    [sun],
  )

  useFrame(() => {
    const state = useOrbitStore.getState().state
    if (!state) return
    // Computed here rather than read off the Sun's light, so the two cannot drift apart through a
    // change to the order components happen to update in.
    sun.set(...sunDirectionLvlh(state, new Date()))
  })

  return (
    <>
      {/*
        The haze between the eye and the ground.
        
        Ordinary alpha rather than additive, because haze is not a glow: it adds its own light and
        washes out what is behind it in the same stroke, which is what a blend already does. The
        shell only exists to give every pixel of the planet a fragment to run in — its radius is
        arbitrary above the cloud tops, and the shader discards anything whose ray misses the
        ground, so it covers exactly the disc and stops where the limb takes over.

        Drawn before the limb, and both after the surface: `renderOrder` decides it outright,
        because all three shells share a centre and so sort at the same distance.
      */}
      <mesh position={CENTRE} renderOrder={1}>
        <sphereGeometry args={[HAZE_RADIUS, 96, 64]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={hazeFragmentShader}
          uniforms={hazeUniforms}
          transparent
          side={FrontSide}
          depthWrite={false}
        />
      </mesh>

      <mesh position={CENTRE} renderOrder={2}>
        <sphereGeometry args={[ATMOSPHERE_RADIUS, 96, 64]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          side={BackSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}
