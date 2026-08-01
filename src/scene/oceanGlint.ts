/**
 * How rough the sea is, and therefore how the Sun sits on it.
 *
 * The planet was `roughness: 0.95` — near-matte, which is paint, not water. The one thing every
 * photograph taken over an ocean in daylight has and this scene did not is the glint: the smeared
 * bright patch where the Sun reflects off the water. It is not a decoration, it is what tells the
 * eye that the blue is liquid.
 *
 * The number is derived rather than dialled in, because the interesting property of a glint is its
 * *size*, and size is set by the slope of the waves. Cox and Munk measured that from aerial
 * photographs in 1954 and the result is still the standard: the variance of the sea surface's slope
 * runs about `0.003 + 0.00512·U` for a wind of U metres per second, near enough regardless of the
 * rest of the sea state.
 *
 *   wind           7 m/s, an ordinary day at sea
 *   slope variance 0.003 + 0.00512 × 7 = 0.0388
 *   RMS slope      √0.0388 = 0.197 rad, about 11°
 *
 * Getting from there to the renderer costs two conversions, and both are worth writing down because
 * neither is guessable. A GGX lobe's width `α` is √2 times the RMS slope, and three.js takes
 * *perceptual* roughness, which is `√α`. So:
 *
 *   α = √2 × 0.197 = 0.279
 *   roughness = √0.279 = 0.53
 *
 * Wind is the only free parameter, and it moves this slowly: a flat calm at 2 m/s gives 0.44, a
 * gale at 20 m/s gives 0.66. Anything in that band reads as water, which is the useful thing to
 * know — the glint does not need the weather to be right, only the physics.
 */

/** Cox–Munk: slope variance against wind speed, from aerial photographs of the sea surface. */
export function slopeVariance(windSpeed: number): number {
  return 0.003 + 0.00512 * windSpeed
}

/**
 * The perceptual roughness three.js wants, for a sea under a given wind.
 *
 * Two steps, in order: RMS slope to GGX width, GGX width to the perceptual value the material
 * exposes. Doing either one and stopping is the mistake this function exists to prevent — they
 * pull in opposite directions, so a half-conversion lands close enough to look plausible.
 */
export function seaRoughness(windSpeed: number): number {
  const rmsSlope = Math.sqrt(slopeVariance(windSpeed))
  const ggxWidth = Math.SQRT2 * rmsSlope
  return Math.sqrt(ggxWidth)
}

/** An ordinary day at sea. The glint is not sensitive to this; see the note above. */
export const OCEAN_WIND_SPEED = 7

export const OCEAN_ROUGHNESS = seaRoughness(OCEAN_WIND_SPEED)
