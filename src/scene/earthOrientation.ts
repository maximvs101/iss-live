/**
 * Which way round the planet is.
 *
 * The scene never needed this before. Its Earth was an unmarked blue sphere, so any orientation
 * looked the same and none was given. The moment anything is painted on it — city lights, here —
 * the question becomes sharp, and getting it wrong is worse than leaving the sphere bare: lights
 * in the wrong place are a claim about geography, and a false one.
 *
 * The scene is in LVLH and stays there: the station sits at the origin, the planet's centre
 * directly below on −Y, +X to starboard and +Z aft, which makes the velocity −Z. So the planet is
 * what turns, and the rotation that turns it is fixed by three facts about the sub-satellite point:
 * the ground directly below the station is at that latitude and longitude, up there is +Y here, and
 * geographic north there points along the heading the ground track is running.
 *
 * All three are needed. Latitude and longitude alone leave the planet free to spin about the nadir
 * axis, which would put the right piece of ground below the station and turn it to a random angle.
 */

/** Degrees to radians. */
const rad = (degrees: number) => (degrees * Math.PI) / 180

type Vec3 = [number, number, number]

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/**
 * Initial bearing from one ground point to the next, in degrees clockwise from north.
 *
 * The great-circle formula rather than the flat-map difference `trackHeading` uses for the map
 * marker. There the map is the thing being drawn on and its own distortion is the right answer;
 * here the sphere is real and a flat approximation would tilt the texture, worst at high latitude,
 * which is exactly where the ground track spends its time turning.
 */
export function groundHeading(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const φ1 = rad(from.latitude)
  const φ2 = rad(to.latitude)
  const Δλ = rad(to.longitude - from.longitude)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * A direction in the Earth-fixed frame: +Y through the north pole, +X out of (0°, 0°), +Z out of
 * (0°, 90°E). That is the frame the texture's latitude and longitude are read in.
 */
export function geocentric(latitude: number, longitude: number): Vec3 {
  const φ = rad(latitude)
  const λ = rad(longitude)
  return [Math.cos(φ) * Math.cos(λ), Math.sin(φ), Math.cos(φ) * Math.sin(λ)]
}

/**
 * Rotation taking a direction in the scene to the same direction in the Earth-fixed frame,
 * column-major, ready for `Matrix3.fromArray`.
 *
 * Built from two orthonormal triads rather than from angles, because angles need a convention and
 * a convention needs remembering. Each triad is (east, north, up) at the sub-satellite point — one
 * written in scene coordinates, one in Earth coordinates — and the rotation between them is the
 * only one that carries the first onto the second.
 */
export function earthOrientation(
  latitude: number,
  longitude: number,
  heading: number,
): number[] {
  // In the scene: the station flies along −Z, zenith is +Y. At a heading of 0 the ground track
  // runs due north, so north is the velocity and east is to starboard; a heading of θ turns that
  // pair by θ about the zenith.
  const θ = rad(heading)
  const velocity: Vec3 = [0, 0, -1]
  const starboard: Vec3 = [1, 0, 0]
  const north: Vec3 = [
    Math.cos(θ) * velocity[0] - Math.sin(θ) * starboard[0],
    Math.cos(θ) * velocity[1] - Math.sin(θ) * starboard[1],
    Math.cos(θ) * velocity[2] - Math.sin(θ) * starboard[2],
  ]
  const east: Vec3 = [
    Math.sin(θ) * velocity[0] + Math.cos(θ) * starboard[0],
    Math.sin(θ) * velocity[1] + Math.cos(θ) * starboard[1],
    Math.sin(θ) * velocity[2] + Math.cos(θ) * starboard[2],
  ]
  const up: Vec3 = [0, 1, 0]

  // The same triad on the planet.
  const upEarth = geocentric(latitude, longitude)
  const φ = rad(latitude)
  const λ = rad(longitude)
  const northEarth: Vec3 = [-Math.sin(φ) * Math.cos(λ), Math.cos(φ), -Math.sin(φ) * Math.sin(λ)]
  const eastEarth: Vec3 = [-Math.sin(λ), 0, Math.cos(λ)]

  // R = [eastEarth northEarth upEarth] · [east north up]ᵀ. Each column of the result is where a
  // scene axis lands, which is what a mat3 uniform multiplies by.
  const sceneRows = [east, north, up]
  const earthCols = [eastEarth, northEarth, upEarth]
  const columns: Vec3[] = [0, 1, 2].map((axis) => {
    // Component of this scene axis along each of (east, north, up), then rebuilt on the planet.
    const weights = sceneRows.map((row) => row[axis])
    return [0, 1, 2].map((component) =>
      weights.reduce((sum, weight, i) => sum + weight * earthCols[i][component], 0),
    ) as Vec3
  })

  return [...columns[0], ...columns[1], ...columns[2]]
}

/** Applies a column-major 3×3 to a vector. For tests, and for reasoning about one. */
export function transform(matrix: number[], v: Vec3): Vec3 {
  return [0, 1, 2].map((row) =>
    [0, 1, 2].reduce((sum, column) => sum + matrix[column * 3 + row] * v[column], 0),
  ) as Vec3
}

/** Latitude and longitude a direction in the Earth-fixed frame points at, in degrees. */
export function geodetic(v: Vec3): { latitude: number; longitude: number } {
  const length = Math.hypot(...v)
  const n = v.map((component) => component / length) as Vec3
  return {
    latitude: (Math.asin(Math.max(-1, Math.min(1, n[1]))) * 180) / Math.PI,
    longitude: (Math.atan2(n[2], n[0]) * 180) / Math.PI,
  }
}

/** Sanity check for the cross products above, and the reason `cross` exists. */
export const RIGHT_HANDED = cross([1, 0, 0], [0, 1, 0])
