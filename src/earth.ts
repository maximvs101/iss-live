/**
 * The planet, stated once.
 *
 * This number was written out five times — in the propagator, the map projection, the limb
 * geometry, the two-scale reconciliation, and the cloud shell — and one of those five carried the
 * comment "as everywhere else in this codebase", which is a seam describing itself. Nothing had
 * yet drifted; the point is that nothing can now, because the four modules that turn kilometres
 * into pixels, scene units, and ground tracks read the same constant.
 *
 * Drift here would be quiet. The map would place the ground track against one planet and the globe
 * would draw the terminator against another, and the two views agree to within 0.157° today only
 * because they happen to be built on the same figure.
 */

/**
 * Mean radius of the Earth, in kilometres.
 *
 * The mean, not the equatorial 6378.137 of WGS-84. Everything here that consumes it wants a sphere:
 * an equirectangular map, a spherical limb, and a horizon angle quoted to a tenth of a degree. The
 * 21 km of flattening is below what any of them resolve, and using the equatorial figure would make
 * the polar horizon wrong by more than the mean makes either.
 */
export const EARTH_RADIUS_KM = 6371
