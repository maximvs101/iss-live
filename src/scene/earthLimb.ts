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
 * For a long time that held from one point and one point only. Pulling the camera out to 400 units
 * closed the horizon from 69.7° to 50.9°, where 400 metres at orbital altitude moves it by nine
 * thousandths of a degree — the planet visibly shrank like a beach ball whenever anyone stepped
 * back. These numbers still describe where the sphere sits; what recovers the parallax is drawing
 * it from a camera of its own, in distantScene.
 */

import { EARTH_RADIUS_KM as EARTH_KM } from '../earth.ts'

/** The station's nominal altitude, in kilometres. */
const ALTITUDE_KM = 420

export const EARTH_RADIUS = 1800

/** `sin(angular radius)` is `R / (R + h)`, so the distance is the radius scaled by its inverse. */
export const EARTH_CENTRE = EARTH_RADIUS * ((EARTH_KM + ALTITUDE_KM) / EARTH_KM)

/**
 * Height of the air that shows at the limb, in kilometres.
 *
 * Not the atmosphere's full height — there is no such number — but the band that is bright enough
 * to photograph. Below about 100 km the density is still within a few orders of magnitude of the
 * ground's; above it, nothing scatters enough to see. In the pictures this is the blue arc, and it
 * ends well below the aurorae at 100–300 km.
 */
const ATMOSPHERE_KM = 100

/** Outer edge of that band, in scene units. */
export const ATMOSPHERE_RADIUS = EARTH_RADIUS * ((EARTH_KM + ATMOSPHERE_KM) / EARTH_KM)

/**
 * Longest path a ray can take through the air without touching the ground, in scene units.
 *
 * This is why the limb glows at all, and it is worth having as a number rather than as an
 * intuition. The band is only 28 units thick here, but a ray that grazes the surface travels
 * **640** units through it — twenty-two times further than the shell is deep. Straight down, the
 * same air is barely visible; edge-on it is a wall. The shader normalises against this, so a ray
 * skimming the ground reads 1 and the very top of the band reads 0.
 */
export const LIMB_CHORD = 2 * Math.sqrt(ATMOSPHERE_RADIUS ** 2 - EARTH_RADIUS ** 2)
