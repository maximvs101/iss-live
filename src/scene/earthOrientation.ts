/**
 * The frame the planet's textures are read in, and nothing else.
 *
 * +Y through the north pole, +X out of (0°, 0°), +Z out of (0°, 90° **west**. The rotation that
 * carries the scene onto this frame lives in `earthOrientationLvlh`, next to the sidereal time and
 * the orbital basis it needs; what stays here is the convention itself, because a convention needs
 * one place to be written down and two places to disagree.
 *
 * The west is not a whim, and getting it wrong is what happened first. Putting +Z through 90° east
 * reads more naturally and quietly makes the frame **left-handed**, because with the pole on +Y an
 * eastward longitude turns about −Y. Everything downstream still worked: the triads stayed
 * orthonormal, the sub-satellite point still landed under the station, north still ran along the
 * ground track — and the entire map was mirrored east for west.
 *
 * Worse, it survived the obvious check. Sampling a rendered pixel, converting it to a latitude and
 * longitude *with the same matrix* and comparing against the texture is a loop containing the error
 * twice, so it agreed with itself: that check passed, on a city, to a third of a degree. What
 * catches it is a determinant, or a second opinion from something that does not use this frame at
 * all — the Sun.
 */

/** Degrees to radians. */
const rad = (degrees: number) => (degrees * Math.PI) / 180

type Vec3 = [number, number, number]

/** A direction in the Earth-fixed frame, from latitude and longitude in degrees. */
export function geocentric(latitude: number, longitude: number): Vec3 {
  const φ = rad(latitude)
  const λ = rad(longitude)
  return [Math.cos(φ) * Math.cos(λ), Math.sin(φ), -Math.cos(φ) * Math.sin(λ)]
}

/** Latitude and longitude a direction in the Earth-fixed frame points at, in degrees. */
export function geodetic(v: Vec3): { latitude: number; longitude: number } {
  const length = Math.hypot(...v)
  const n = v.map((component) => component / length) as Vec3
  return {
    latitude: (Math.asin(Math.max(-1, Math.min(1, n[1]))) * 180) / Math.PI,
    longitude: (Math.atan2(-n[2], n[0]) * 180) / Math.PI,
  }
}

/** Applies a column-major 3×3 to a vector. For tests, and for reasoning about one. */
export function transform(matrix: number[], v: Vec3): Vec3 {
  return [0, 1, 2].map((row) =>
    [0, 1, 2].reduce((sum, column) => sum + matrix[column * 3 + row] * v[column], 0),
  ) as Vec3
}
