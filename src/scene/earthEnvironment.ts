/**
 * The planet, as a light source rather than as a lamp.
 *
 * The station's surfaces are largely metal — 38 of the file's 42 materials carry a
 * `metallicFactor`, and once each one is multiplied by the blue channel of its own
 * metallic-roughness map the mesh-weighted mean comes out at **0.528 over 775 primitives**. That
 * number decides how the scene has to be lit, because a standard material computes
 * `diffuse = baseColour × (1 − metalness)`: at metalness 1 there is no diffuse term at all, and
 * ambient light, hemisphere light and every fill lamp go straight past. Only the specular lobe of
 * a real light reaches metal, and only from the direction that light happens to be in.
 *
 * Measured on the live renderer, mutating in both directions and back: with no environment the
 * shadow side of the station sat at a mean luminance of **17.9 of 255**, against **70.3** with one
 * — while the sunlit side moved from 113.3 to 115.5, and the control drift between two untouched
 * frames was 0.6. The scene's own comments set the ambient to 0.16 so that "the shadow side stays
 * readable, which matters in a tool whose whole purpose is inspecting the parts on that side". The
 * intention was written down and never reached three quarters of the station.
 *
 * So the Earth is given to the renderer as what it is: a cap of sky, filled by the planet out to
 * the horizon and black everywhere else. This replaces the nadir-facing directional light that
 * used to stand in for it — same colour, same strength, same law through eclipse, delivered from
 * the whole cap instead of one direction, and now reaching metal.
 */
import { DataTexture, EquirectangularReflectionMapping, SRGBColorSpace } from 'three'
import { horizonAngle } from './distantScene'

/**
 * Angular radius of the planet seen from the station, in radians.
 *
 * Taken from the module the sky is drawn with rather than restated: `verify:render` already holds
 * that figure — 69.7437° — against an independent calculation in kilometres, and a second copy
 * here would be a second thing to keep in step.
 */
export const EARTH_CAP = (horizonAngle([0, 0, 0]).real * Math.PI) / 180

/**
 * The colour the planet throws back.
 *
 * Unchanged from the directional light this replaces, so the substitution is a change of delivery
 * and not of palette.
 */
export const EARTHSHINE_COLOUR = { r: 0x6f, g: 0x93, b: 0xc4 }

/**
 * Irradiance a cap of unit radiance lays on a surface facing its middle.
 *
 *   E = ∫ L cosθ dω = L · 2π ∫₀^θ cos·sin = L · π · sin²θ
 *
 * This is the whole of the conversion between the two ways of writing the same light. A
 * directional light of intensity I delivers exactly I to a surface facing it, so a cap that is to
 * replace it must carry a radiance of I / (π sin²θ) — about a third of I here, spread over a third
 * of the sky. `earthEnvironment.test.ts` integrates the texture numerically and checks it lands on
 * this closed form rather than on a number typed in beside it.
 */
export function capIrradiance(halfAngle: number): number {
  return Math.PI * Math.sin(halfAngle) ** 2
}

/**
 * What the fill from below is worth, before it is spread over the cap.
 *
 * Verbatim from the light this replaces, *including* the part that is not physics: it rises
 * through eclipse rather than falling, because in the Earth's shadow it is all that is left and a
 * black screen every other half-hour would be faithful and useless. That was a deliberate reading
 * decision and it is not revisited here.
 */
export function earthshineIntensity(shadow: number): number {
  return 0.38 + 0.55 * shadow
}

/** The same, expressed as the radiance an environment map has to carry to deliver it. */
export function environmentIntensity(shadow: number): number {
  return earthshineIntensity(shadow) / capIrradiance(EARTH_CAP)
}

/**
 * How much of one row of the equirectangular image falls inside the cap.
 *
 * A hard step would put the horizon wherever the nearest row boundary happens to be, so the
 * boundary row carries the fraction of its own band that is planet. That makes the cap's total
 * flux independent of the resolution — which is what the test measures — and softens an edge that
 * would otherwise be a visible staircase in anything smooth enough to reflect it.
 */
export function rowCoverage(row: number, height: number, halfAngle = EARTH_CAP): number {
  // Equirectangular: v runs 0 at −Y to 1 at +Y, so the elevation is π(v − ½) and the angle down
  // from the nadir is that plus a right angle — which is πv, and the row spans two of them.
  const fromNadir = (v: number) => v * Math.PI

  const lower = fromNadir(row / height)
  const upper = fromNadir((row + 1) / height)
  if (upper <= halfAngle) return 1
  if (lower >= halfAngle) return 0
  return (halfAngle - lower) / (upper - lower)
}

/**
 * The environment itself: an equirectangular image, planet below, black above.
 *
 * 64 rows is 2.8° each, which the boundary fraction above makes finer than it sounds, and three.js
 * filters it into a cube map before anything samples it. Bigger buys nothing: the source is one
 * flat colour and one edge.
 */
export function earthEnvironment(height = 64): DataTexture {
  const width = height * 2
  const data = new Uint8Array(width * height * 4)

  for (let row = 0; row < height; row += 1) {
    const coverage = rowCoverage(row, height)
    const { r, g, b } = EARTHSHINE_COLOUR
    for (let column = 0; column < width; column += 1) {
      const at = (row * width + column) * 4
      data[at] = Math.round(r * coverage)
      data[at + 1] = Math.round(g * coverage)
      data[at + 2] = Math.round(b * coverage)
      data[at + 3] = 255
    }
  }

  // `DataTexture` does not flip, so row 0 is v = 0, which the equirectangular sampler reads as
  // straight down. The planet therefore belongs at the start of the buffer, not the end.
  const texture = new DataTexture(data, width, height)
  texture.mapping = EquirectangularReflectionMapping
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}
