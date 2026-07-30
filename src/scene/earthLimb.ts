/**
 * Where the Earth goes in the 3D scene.
 *
 * Its own module rather than a constant inside the view, because it is a geometric fact that
 * wants testing, and importing it from the component would drag three.js, react-three-fiber and a
 * GLB loader into a plain Node test to read two numbers.
 *
 * The planet cannot be to scale: 6,371,000 units across with its centre 6,791,000 below, in a
 * scene whose far plane is at 4,000. Something has to give, and the thing worth keeping is what
 * the eye actually reads — how much sky the planet fills. From 420 km the Earth's angular radius
 * is `asin(6371 / 6791)` = **69.7°**, so it covers 139° of the sky and the horizon sits well below
 * the station rather than at its feet.
 *
 * A sphere of radius r at distance d subtends `asin(r / d)`, so matching that angle means
 * `d = r · (R + h) / R`. At r = 1800 the centre falls at 1919 and the far side at 3719 — inside
 * the existing far plane, so the depth buffer keeps the range it was tuned for and the station's
 * fine geometry does not start z-fighting.
 *
 * What this does not preserve is parallax: pull the camera out to 400 units and the horizon shifts
 * about 12°, where 400 metres at orbital altitude would move it by three hundredths of a degree.
 * The alternative is a planet that will not fit in the scene at all.
 */

/** Mean radius and the station's nominal altitude, in kilometres. */
const EARTH_KM = 6371
const ALTITUDE_KM = 420

export const EARTH_RADIUS = 1800

/** `sin(angular radius)` is `R / (R + h)`, so the distance is the radius scaled by its inverse. */
export const EARTH_CENTRE = EARTH_RADIUS * ((EARTH_KM + ALTITUDE_KM) / EARTH_KM)
