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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  DataTexture,
  Group,
  Matrix3,
  Matrix4,
  SRGBColorSpace,
  TextureLoader,
  Vector4,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { useOrbitStore } from '../orbit/useOrbit'
import { earthOrientationLvlh } from '../orbit/propagator'
import { EARTH_CENTRE, EARTH_RADIUS } from './earthLimb'
import { EARTH_RADIUS_KM } from '../earth'
import { tileAt, tileName, tileUvBox, type TileId } from './earthDetail'

const TEXTURE = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`

/**
 * Which month's planet to paint.
 *
 * Blue Marble is a set of twelve composites and the first version of this took one of them —
 * December — which put snow across two thirds of the northern hemisphere's land in the middle of
 * August and made the whole thing read as the Moon. The station is where it is *now*, so the ground
 * under it should be the ground that is there now: Manitoba in August is green, and its saturation
 * in the August composite is seven times what December gives.
 *
 * Read once, at mount. A session that crosses midnight on the last of the month keeps the texture
 * it started with, which is a thirtieth of a degree of Sun and nobody's idea of a defect.
 */
const month = String(new Date().getMonth() + 1).padStart(2, '0')

/**
 * Height of the cloud deck, scaled with the planet like everything else.
 *
 * 12 km is the top of the troposphere at the equator, which is where the tall weather stops. On
 * this sphere that is 3.4 units — invisible as a gap, which is right: from 420 km the clouds sit on
 * the ground, and their height shows only in the shadows they cast, which this does not attempt.
 */
const CLOUD_TOP_KM = 12
const CLOUD_RADIUS = EARTH_RADIUS * ((EARTH_RADIUS_KM + CLOUD_TOP_KM) / EARTH_RADIUS_KM)

/** Loads a texture once, tags it sRGB, and disposes it on the way out. */
function useSurfaceTexture(name: string, colour = true): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null)
  const gl = useThree((three) => three.gl)

  useEffect(() => {
    let live = true
    new TextureLoader().load(TEXTURE(name), (loaded) => {
      if (!live) {
        loaded.dispose()
        return
      }
      // Colour maps are sRGB; the roughness map is data and must not be decoded as if it were not.
      if (colour) loaded.colorSpace = SRGBColorSpace
      // Most of the planet is seen edge-on. Without this the mip chain picks a level sized to the
      // *compressed* direction and smears the other one, so the ground towards the limb — which is
      // most of the frame — is blurred far past what the texture can actually resolve.
      loaded.anisotropy = gl.capabilities.getMaxAnisotropy()
      setTexture(loaded)
    })
    return () => {
      live = false
    }
  }, [name, colour, gl])

  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

/**
 * How much of the tile's edge is spent fading it out.
 *
 * A tile ends on a meridian and a parallel, and sharpness that stops along a straight line is more
 * noticeable than the blur it replaced. An eighth of the tile is 2.25° of fade, about 250 km, which
 * is wide enough that no edge is findable and narrow enough to leave the middle at full strength.
 */
const EDGE_FADE = 0.125

/** Ratio encoding: the build stores `value / 255 * 4`, so unity is 64. See build-earth-detail. */
const RATIO_RANGE = 4

/**
 * The close-up tile under the station, swapped as it crosses the grid.
 *
 * Tiles over open water are not shipped at all — Blue Marble has nothing there for a sharper
 * texture to resolve — so a miss is the ordinary case rather than an error, and the name is
 * remembered so a missing tile is asked for once and not once a frame.
 */
function useDetailTile() {
  const [tile, setTile] = useState<{ id: TileId; texture: Texture } | null>(null)
  const wanted = useRef<string | null>(null)
  const absent = useRef(new Set<string>())

  useFrame(() => {
    const { state } = useOrbitStore.getState()
    if (!state) return
    const id = tileAt(state.latitude, state.longitude)
    const name = id ? tileName(id) : null
    if (name === wanted.current) return
    wanted.current = name

    if (!name || !id || absent.current.has(name)) {
      setTile(null)
      return
    }
    new TextureLoader().load(
      TEXTURE(name),
      (loaded) => {
        // The ratio is data, not colour: decoding it as sRGB would apply the curve twice.
        loaded.anisotropy = 8
        if (wanted.current !== name) {
          loaded.dispose()
          return
        }
        setTile((previous) => {
          previous?.texture.dispose()
          return { id, texture: loaded }
        })
      },
      undefined,
      () => {
        absent.current.add(name)
        setTile(null)
      },
    )
  })

  useEffect(() => () => tile?.texture.dispose(), [tile])
  return tile
}

export function EarthSurface() {
  const group = useRef<Group>(null)
  const day = useSurfaceTexture(`earth-day-${month}.jpg`)
  const roughness = useSurfaceTexture(`earth-roughness-${month}.jpg`, false)
  // Data, not colour. It is an opacity map now, and tagging it sRGB makes the *hardware* decode it
  // on every sample — which quietly crushed a cloud stored at 0.30 down to 0.07 of opacity.
  const clouds = useSurfaceTexture('earth-clouds.jpg', false)

  const detail = useDetailTile()

  /*
   * The detail is fed into the standard material rather than drawn as a second surface. A patch of
   * geometry laid over the globe would need its own lighting, its own glint and its own edge, and
   * would have to agree with the sphere underneath about all three; multiplying inside the one
   * material cannot disagree with itself.
   *
   * Multiplying is also what the data is: the tile holds the 500 m imagery *divided by* the global
   * map, so the month, the season and the colour keep coming from the map and the tile only
   * restores what the map is too coarse to hold.
   */
  const neutral = useMemo(() => {
    const texture = new DataTexture(new Uint8Array([64, 64, 64, 255]), 1, 1)
    texture.needsUpdate = true
    return texture
  }, [])

  const detailUniforms = useMemo(
    () => ({
      uDetail: { value: neutral as Texture },
      uDetailBox: { value: new Vector4(0, 0, 1, 1) },
      uDetailStrength: { value: 0 },
    }),
    [neutral],
  )

  useEffect(() => {
    if (detail) {
      const { origin, size } = tileUvBox(detail.id)
      detailUniforms.uDetailBox.value.set(origin[0], origin[1], size[0], size[1])
      detailUniforms.uDetail.value = detail.texture
      detailUniforms.uDetailStrength.value = 1
    } else {
      detailUniforms.uDetail.value = neutral
      detailUniforms.uDetailStrength.value = 0
    }
  }, [detail, detailUniforms, neutral])

  const injectDetail = useCallback(
    (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, detailUniforms)
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D uDetail;
           uniform vec4 uDetailBox;
           uniform float uDetailStrength;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           {
             vec2 inTile = (vMapUv - uDetailBox.xy) / uDetailBox.zw;
             vec2 within = step(vec2(0.0), inTile) * step(inTile, vec2(1.0));
             vec2 fade = smoothstep(vec2(0.0), vec2(${EDGE_FADE}), inTile) *
                         smoothstep(vec2(0.0), vec2(${EDGE_FADE}), vec2(1.0) - inTile);
             float amount = within.x * within.y * fade.x * fade.y * uDetailStrength;
             // Luminance only: the tile carries how much brighter this kilometre is than the map
             // says, and the map keeps the colour. See build-earth-detail for why chroma was left out.
             float ratio = texture2D(uDetail, clamp(inTile, 0.0, 1.0)).r * ${RATIO_RANGE}.0;
             diffuseColor.rgb *= mix(1.0, ratio, amount);
           }`,
        )
    },
    [detailUniforms],
  )

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
            onBeforeCompile={injectDetail}
          />
        </mesh>

        {clouds && (
          /*
           * Clouds, and an honest label: this is a cloud field, and it is not today's. It is NASA's
           * Blue Marble cloud layer for **29 July 2001** — one day's observations, not a month's
           * averaged, which an earlier version of this comment claimed. The correction matters
           * because it is the difference between a smooth statistic and a real sky, and the sky is
           * what is drawn: cyclones, fronts and the ITCZ, all in the places they were on that
           * morning. Nothing in this app invents data, so it must not be read as a forecast — hence
           * the note in the README and the absence of any claim in the interface that it is current.
           *
           * Lit by the scene's own Sun like everything else, so the terminator runs across the
           * cloud tops exactly where it runs across the ground.
           *
           * **White, with the image supplying opacity alone.** It was wired as both `map` and
           * `alphaMap` at first, which is a category error: a cloud is white, and the greyscale is
           * how *much* cloud there is, not what colour it is. Using it twice multiplied the two
           * together — a cloud stored at 0.30 came out as a 0.30-grey at 0.30 opacity, so instead
           * of white it laid a dark film over the ground. Measured, that was worth only eight
           * levels out of 255, so it was never the reason the planet looked grey; it was still
           * wrong.
           */
          <mesh castShadow={false} receiveShadow={false}>
            <sphereGeometry args={[CLOUD_RADIUS, 96, 64]} />
            <meshStandardMaterial
              color="#ffffff"
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
