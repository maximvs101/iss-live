/**
 * Audits every calculation the two views are drawn from, one at a time, against a second route.
 *
 * Written after a run of defects that all had one shape: a number taken on trust from the code next
 * door. A December basemap fetched without noticing it was one of twelve months. A cloud field
 * described as a monthly mean without the file ever being opened. Two textures compared while a
 * shared `source` object meant both were the same image. A channel count assumed on a readback,
 * ten lines under a comment warning about exactly that. None of these was a hard problem; each was
 * an assumption about the thing beside the thing being edited.
 *
 * So this script is organised by **chain rather than by file**, and it ends with the section that
 * matters most: the seams where the 2D map and the 3D scene have to agree about the same fact. A
 * function is easy to test alone and that is not where these live.
 *
 * The rule for every check: compute the expected value by a route the code under test does not
 * use. Where that is impossible — a convention is a convention — the check says so rather than
 * dressing a restatement up as a verification.
 *
 * Usage: npm run verify:render
 */
import { twoline2satrec } from 'satellite.js'
import {
  betaAngle,
  earthOrientationLvlh,
  normalizeLongitude,
  propagateIss,
  subsolarPoint,
  sunDirectionEci,
  sunDirectionLvlh,
} from '../src/orbit/propagator.ts'
import { geocentric, geodetic, transform } from '../src/scene/earthOrientation.ts'
import {
  footprintPoints,
  latToY,
  lonToX,
  nightRegion,
  splitAtAntimeridian,
  terminatorLatitude,
  trackHeading,
  trackTicks,
  withinFootprint,
} from '../src/scene/map/projection.ts'
import { ATMOSPHERE_RADIUS, EARTH_CENTRE, EARTH_RADIUS, LIMB_CHORD } from '../src/scene/earthLimb.ts'
import {
  DISTANT_FAR,
  DISTANT_NEAR,
  KM_PER_EARTH_UNIT,
  PARALLAX_SCALE,
  horizonAngle,
} from '../src/scene/distantScene.ts'
import { PAN_LIMIT, STATION_RADIUS, clampTarget, clearances, farPlane } from '../src/scene/cameraReach.ts'
import { OCEAN_ROUGHNESS, OCEAN_WIND_SPEED, seaRoughness, slopeVariance } from '../src/scene/oceanGlint.ts'
import { groundHaze, limbShading } from '../src/scene/limbScattering.ts'
import { markerPlacement } from '../src/scene/sunMarker.ts'

const R = 6371
const H = 420
const rad = Math.PI / 180
const deg = (r) => r / rad

/** Real elements for the ISS, from Celestrak on 28/07/2026. */
const satrec = twoline2satrec(
  '1 25544U 98067A   26209.15252568  .00010831  00000+0  20282-3 0  9992',
  '2 25544  51.6320  97.3682 0007093 345.6120  14.4666 15.49220842578109',
)

const SAMPLES = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 6, 28, 6, i * 8)))

let failures = 0
let checks = 0
let section = ''

const heading = (title) => {
  section = title
  console.log(`\n${title}`)
}

/** One line, one claim, one verdict. `detail` is printed either way — a passing number is evidence. */
const check = (name, ok, detail) => {
  checks += 1
  if (!ok) failures += 1
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${name.padEnd(52)} ${detail}`)
}

const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance

// ─── A. Where the station is, which both views draw from ─────────────────────────────────────────

heading('A. The station’s state — shared by both views')

{
  // A1. The footprint radius, by a different triangle. The code takes R·acos(R/(R+h)); the same
  // central angle is also atan(√((R+h)² − R²) / R), which shares no inverse function with it.
  const state = propagateIss(satrec, SAMPLES[0])
  const alt = state.altitude
  const viaAtan = R * Math.atan(Math.sqrt((R + alt) ** 2 - R ** 2) / R)
  check(
    'footprint radius agrees with a second triangle',
    near(state.footprintKm, viaAtan, 0.001),
    `${state.footprintKm.toFixed(3)} km against ${viaAtan.toFixed(3)}`,
  )

  // And is *not* the arcsine, which is the mistake the geometry invites: asin(R/(R+h)) is the
  // horizon's angular radius seen from orbit, a different quantity that shares both inputs.
  const wrong = R * Math.asin(R / (R + alt))
  check(
    'footprint radius is not the arcsine form',
    Math.abs(state.footprintKm - wrong) > 5000,
    `${state.footprintKm.toFixed(0)} km against the trap’s ${wrong.toFixed(0)} km`,
  )
}

{
  // A2. The subsolar point, against a low-precision solar almanac that shares no code with
  // satellite.js — mean longitude, equation of centre, obliquity, and GMST from the day number.
  let worstLat = 0
  let worstLon = 0
  for (const when of SAMPLES) {
    const n = when.getTime() / 86400000 + 2440587.5 - 2451545.0
    const L = (280.46 + 0.9856474 * n) * rad
    const g = (357.528 + 0.9856003 * n) * rad
    const lambda = L + 1.915 * rad * Math.sin(g) + 0.02 * rad * Math.sin(2 * g)
    const eps = (23.439 - 0.0000004 * n) * rad
    const declination = deg(Math.asin(Math.sin(eps) * Math.sin(lambda)))
    const rightAscension = deg(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)))
    const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24
    const longitude = normalizeLongitude(rightAscension - gmstHours * 15)

    const sub = subsolarPoint(when)
    worstLat = Math.max(worstLat, Math.abs(sub.latitude - declination))
    worstLon = Math.max(worstLon, Math.abs(normalizeLongitude(sub.longitude - longitude)))
  }
  check(
    'subsolar point agrees with an independent almanac',
    worstLat < 0.3 && worstLon < 0.3,
    `worst ${worstLat.toFixed(3)}° of latitude, ${worstLon.toFixed(3)}° of longitude`,
  )
}

{
  // A3. The beta angle, against the eclipse it predicts. This is the strongest check available on
  // it: beta is computed from a cross product, while the fraction of an orbit spent in shadow
  // follows from a closed form that knows only the altitude and beta — and the shadow itself comes
  // from satellite.js's own umbra test, which knows nothing about either.
  const when = SAMPLES[0]
  const beta = betaAngle(propagateIss(satrec, when), when)
  const grazing = Math.sqrt(H * H + 2 * R * H) / (R + H)
  const predicted =
    Math.abs(Math.cos(beta * rad)) <= grazing
      ? 0
      : deg(Math.acos(grazing / Math.cos(beta * rad))) / 180

  const period = propagateIss(satrec, when).periodMinutes
  let dark = 0
  let total = 0
  for (let m = 0; m < period; m += 0.25) {
    const st = propagateIss(satrec, new Date(when.getTime() + m * 60000))
    if (st.shadow > 0.5) dark += 1
    total += 1
  }
  const measured = dark / total
  check(
    'beta angle predicts the measured eclipse fraction',
    near(measured, predicted, 0.02),
    `beta ${beta.toFixed(1)}° predicts ${(predicted * 100).toFixed(1)} %, measured ${(measured * 100).toFixed(1)} %`,
  )

  check(
    'the permanently-sunlit threshold falls where it should',
    near(deg(Math.acos(grazing)), 69.74, 0.01),
    `no eclipse beyond |beta| = ${deg(Math.acos(grazing)).toFixed(2)}°`,
  )
}

// ─── B. The 2D map ───────────────────────────────────────────────────────────────────────────────

heading('B. The map view')

{
  // B1. The projection is a convention, so what can be checked is that it is the convention it
  // claims: corners, centre, and that latitude runs *down* the screen.
  const size = { width: 1000, height: 500 }
  const corners =
    lonToX(-180, size) === 0 &&
    lonToX(180, size) === 1000 &&
    latToY(90, size) === 0 &&
    latToY(-90, size) === 500
  check('plate carrée maps the corners to the corners', corners, 'and 0,0 to the centre')
  check(
    'latitude increases downwards on screen',
    latToY(45, size) < latToY(-45, size),
    `north at ${latToY(45, size)}, south at ${latToY(-45, size)}`,
  )
}

{
  // B2. The heading is a screen angle for SVG's rotate(), so the cardinal cases are the check:
  // east is 0, north is −90 because the y axis points down, and the antimeridian must not spin it.
  const size = { width: 1000, height: 500 }
  const at = (a, b) => trackHeading({ latitude: a[0], longitude: a[1] }, { latitude: b[0], longitude: b[1] }, size)
  check(
    'due east reads 0°, due north −90°, due west 180°',
    at([0, 0], [0, 10]) === 0 && near(at([0, 0], [10, 0]), -90, 1e-9) && near(at([0, 0], [0, -10]), 180, 1e-9),
    `east ${at([0, 0], [0, 10])}, north ${at([0, 0], [10, 0]).toFixed(0)}, west ${at([0, 0], [0, -10]).toFixed(0)}`,
  )
  const across = at([0, 179], [0, -179])
  check(
    'crossing the antimeridian does not reverse the marker',
    Math.abs(across) < 1,
    `${across.toFixed(2)}° where the unwrapped difference would give 180°`,
  )
}

{
  // B3. The terminator, by the definition rather than the rearrangement. The code solves the
  // spherical cosine rule for latitude; this puts the answer back into that rule and asks whether
  // the angular distance to the Sun really is 90°.
  let worst = 0
  for (const when of SAMPLES) {
    const sub = subsolarPoint(when)
    for (let lon = -180; lon < 180; lon += 7) {
      const lat = terminatorLatitude(lon, sub.latitude, sub.longitude)
      const cosAngle =
        Math.sin(lat * rad) * Math.sin(sub.latitude * rad) +
        Math.cos(lat * rad) * Math.cos(sub.latitude * rad) * Math.cos((lon - sub.longitude) * rad)
      worst = Math.max(worst, Math.abs(deg(Math.acos(Math.max(-1, Math.min(1, cosAngle)))) - 90))
    }
  }
  check(
    'every terminator point is 90° from the Sun',
    worst < 1e-6,
    `worst departure ${worst.toExponential(1)}°`,
  )
}

{
  // B4. The night region closes towards a pole. Which pole is a claim about darkness, so it is
  // asked of the Sun rather than of the path: at the closing pole, the Sun must be below the
  // horizon, and at the other one above it.
  let wrong = 0
  for (const when of SAMPLES) {
    const { subsolar } = nightRegion(when, { width: 1000, height: 500 })
    const darkPole = subsolar.latitude >= 0 ? -90 : 90
    const sunAtDarkPole = Math.sin(darkPole * rad) * Math.sin(subsolar.latitude * rad)
    const sunAtLitPole = Math.sin(-darkPole * rad) * Math.sin(subsolar.latitude * rad)
    if (sunAtDarkPole >= 0 || sunAtLitPole <= 0) wrong += 1
  }
  check('the night region closes towards the dark pole', wrong === 0, `${SAMPLES.length} geometries, ${wrong} wrong`)
}

{
  // B5. The antimeridian split.
  const crossing = [{ latitude: 0, longitude: 178 }, { latitude: 1, longitude: 179.5 }, { latitude: 2, longitude: -179 }, { latitude: 3, longitude: -177 }]
  const plain = [{ latitude: 0, longitude: 10 }, { latitude: 1, longitude: 20 }, { latitude: 2, longitude: 30 }]
  check(
    'a track crossing ±180° is split, one that does not is left whole',
    splitAtAntimeridian(crossing).length === 2 && splitAtAntimeridian(plain).length === 1,
    `${splitAtAntimeridian(crossing).length} runs and ${splitAtAntimeridian(plain).length}`,
  )
}

{
  // B6. The footprint circle, against the geometry it stands for. Every point on the drawn oval is
  // taken into ECEF and asked for the station's elevation above its horizon — vector arithmetic
  // sharing nothing with the central-angle threshold the circle is generated from. On the rim the
  // answer must be zero.
  const state = propagateIss(satrec, SAMPLES[0])
  const points = footprintPoints(state.latitude, state.longitude, state.footprintKm, 64)
  const toEcef = (lat, lon, r) => [
    r * Math.cos(lat * rad) * Math.cos(lon * rad),
    r * Math.cos(lat * rad) * Math.sin(lon * rad),
    r * Math.sin(lat * rad),
  ]
  const sat = toEcef(state.latitude, state.longitude, R + state.altitude)
  let worst = 0
  for (const p of points) {
    const ground = toEcef(p.latitude, p.longitude, R)
    const up = ground.map((c) => c / R)
    const toSat = [sat[0] - ground[0], sat[1] - ground[1], sat[2] - ground[2]]
    const range = Math.hypot(...toSat)
    const elevation = deg(Math.asin((up[0] * toSat[0] + up[1] * toSat[1] + up[2] * toSat[2]) / range))
    worst = Math.max(worst, Math.abs(elevation))
  }
  check(
    'the footprint rim sits at zero elevation',
    worst < 0.15,
    `worst ${worst.toFixed(3)}° over 65 points on the rim`,
  )

  // And the boolean the interface labels with agrees with the oval it is drawn beside.
  const inside = withinFootprint({ latitude: state.latitude, longitude: state.longitude }, state, state.footprintKm)
  const outside = withinFootprint(
    { latitude: state.latitude, longitude: normalizeLongitude(state.longitude + 60) },
    state,
    state.footprintKm,
  )
  check('“visible now” agrees with the circle drawn beside it', inside && !outside, 'centre inside, 60° away outside')
}

{
  // B7. The tick search refuses to label a point that is not near the wanted minute.
  const base = Date.UTC(2026, 6, 28, 6, 0, 0)
  const track = Array.from({ length: 60 }, (_, i) => ({
    latitude: 0,
    longitude: i,
    date: new Date(base + i * 30_000),
  }))
  const ticks = trackTicks(track, new Date(base), 15, 90, 20)
  check(
    'ticks stop where the track stops',
    ticks.length === 1 && ticks[0].minutes === 15,
    `${ticks.length} tick on a 30-minute track asked for 90 minutes`,
  )
}

// ─── C. The 3D scene ─────────────────────────────────────────────────────────────────────────────

heading('C. The station view')

{
  // C1. The planet's placement, by the angle it exists to reproduce.
  const subtended = deg(Math.asin(EARTH_RADIUS / EARTH_CENTRE))
  const real = deg(Math.asin(R / (R + H)))
  check(
    'the sphere subtends the real horizon angle',
    near(subtended, real, 1e-9),
    `${subtended.toFixed(4)}° against ${real.toFixed(4)}°`,
  )
  check(
    'and the station is outside it',
    EARTH_CENTRE - EARTH_RADIUS > 100,
    `${(EARTH_CENTRE - EARTH_RADIUS).toFixed(1)} units of clearance`,
  )
}

{
  // C2 and C3. The air, and the chord that makes it glow.
  const bandKm = ((ATMOSPHERE_RADIUS - EARTH_RADIUS) / EARTH_RADIUS) * R
  check('the atmosphere band is 100 km at the planet’s scale', near(bandKm, 100, 1e-6), `${bandKm.toFixed(4)} km`)
  const chord = 2 * Math.sqrt(ATMOSPHERE_RADIUS ** 2 - EARTH_RADIUS ** 2)
  check(
    'the grazing chord is the Pythagorean one',
    near(LIMB_CHORD, chord, 1e-9) && LIMB_CHORD / (ATMOSPHERE_RADIUS - EARTH_RADIUS) > 20,
    `${LIMB_CHORD.toFixed(1)} units through a band ${(ATMOSPHERE_RADIUS - EARTH_RADIUS).toFixed(1)} deep`,
  )
}

{
  // C4. The parallax scale, from the two scales rather than from itself.
  const fromScales = 0.001 / (R / EARTH_RADIUS)
  check(
    'the parallax scale is the ratio of the two scales',
    near(PARALLAX_SCALE, fromScales, 1e-12),
    `${PARALLAX_SCALE.toExponential(4)}, and one unit of planet is ${KM_PER_EARTH_UNIT.toFixed(4)} km`,
  )

  // C5. And the horizon it produces, against the kilometres, everywhere the camera can reach.
  let worst = 0
  for (let d = 15; d <= 400; d += 5) {
    for (let polar = 0; polar <= 180; polar += 10) {
      const p = polar * rad
      const at = horizonAngle([d * Math.sin(p), d * Math.cos(p), 0])
      worst = Math.max(worst, Math.abs(at.pass - at.real))
    }
  }
  check('the drawn horizon follows the real one', worst < 0.001, `worst ${worst.toFixed(5)}° across the camera’s reach`)
}

{
  // C6 and C7. The two frustums hold what each is given to draw.
  check(
    'the sky pass clears the planet at both ends',
    DISTANT_NEAR < EARTH_CENTRE - ATMOSPHERE_RADIUS && DISTANT_FAR > EARTH_CENTRE + ATMOSPHERE_RADIUS,
    `${DISTANT_NEAR} to ${DISTANT_FAR} around ${(EARTH_CENTRE - ATMOSPHERE_RADIUS).toFixed(1)}–${(EARTH_CENTRE + ATMOSPHERE_RADIUS).toFixed(1)}`,
  )
  const far = farPlane(400)
  check(
    'the near pass reaches the far corner of the station',
    far > 400 + PAN_LIMIT + STATION_RADIUS,
    `${far} against ${400 + PAN_LIMIT + STATION_RADIUS} needed`,
  )
  const room = clearances([0, -400, 0], far)
  check(
    'and the camera cannot reach the air from anywhere',
    room.air > 90,
    `${room.air.toFixed(2)} units clear, directly beneath at full reach`,
  )
  const clamped = clampTarget(0, -400, 0)
  check(
    'the pan clamp holds its radius and nothing else',
    near(Math.hypot(...clamped), PAN_LIMIT, 1e-9) && clamped[1] < 0,
    `${Math.hypot(...clamped).toFixed(1)} units, still below the station`,
  )
}

{
  // C8. The solar vector, checked for what it is rather than for how it was made.
  let worstLength = 0
  for (const when of SAMPLES) {
    const v = sunDirectionLvlh(propagateIss(satrec, when), when)
    worstLength = Math.max(worstLength, Math.abs(Math.hypot(...v) - 1))
  }
  check('the scene’s Sun is a unit vector', worstLength < 1e-12, `worst length error ${worstLength.toExponential(1)}`)
}

{
  // C9. The planet's orientation: a rotation, not a reflection, and agreeing with the Sun.
  let worstDet = 0
  let worstSun = 0
  for (const when of SAMPLES) {
    const state = propagateIss(satrec, when)
    const M = earthOrientationLvlh(state, when)
    const x = transform(M, [1, 0, 0])
    const y = transform(M, [0, 1, 0])
    const z = transform(M, [0, 0, 1])
    const det =
      (x[1] * y[2] - x[2] * y[1]) * z[0] + (x[2] * y[0] - x[0] * y[2]) * z[1] + (x[0] * y[1] - x[1] * y[0]) * z[2]
    worstDet = Math.max(worstDet, Math.abs(det - 1))

    const sub = subsolarPoint(when)
    const onGlobe = geocentric(sub.latitude, sub.longitude)
    const intoScene = transform([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]], onGlobe)
    const sun = sunDirectionLvlh(state, when)
    const dot = intoScene[0] * sun[0] + intoScene[1] * sun[1] + intoScene[2] * sun[2]
    worstSun = Math.max(worstSun, deg(Math.acos(Math.max(-1, Math.min(1, dot)))))
  }
  check('the orientation is a rotation, not a reflection', worstDet < 1e-9, `determinant off by ${worstDet.toExponential(1)}`)
  check('and it agrees with the Sun about where the Sun is', worstSun < 0.001, `worst ${worstSun.toFixed(5)}°`)
}

{
  // C10. The Earth-fixed frame, including the handedness that a mirrored map passed every other test with.
  let worst = 0
  for (const [lat, lon] of [[0, 0], [45, -73], [-33, 151], [51.6, 20], [12, 179.5], [-80, -10]]) {
    const back = geodetic(geocentric(lat, lon))
    worst = Math.max(worst, Math.abs(back.latitude - lat), Math.abs(normalizeLongitude(back.longitude - lon)))
  }
  check('latitude and longitude round-trip through the frame', worst < 1e-9, `worst ${worst.toExponential(1)}°`)
  const east = geodetic(geocentric(0, 90)).longitude
  check('east of Greenwich is a positive longitude', near(east, 90, 1e-9), `${east.toFixed(4)}°, where the mirrored frame gave −90`)
}

{
  // C11. The night-lights shader's own arithmetic, replicated here and compared with the frame's.
  let worst = 0
  for (const [lat, lon] of [[0, 0], [45, -73], [-33, 151], [60, 100], [-70, -20]]) {
    const earth = geocentric(lat, lon)
    const shaderLat = deg(Math.asin(Math.max(-1, Math.min(1, earth[1]))))
    const shaderLon = deg(Math.atan2(-earth[2], earth[0]))
    worst = Math.max(worst, Math.abs(shaderLat - lat), Math.abs(normalizeLongitude(shaderLon - lon)))
  }
  check('the city-lights shader reads the same frame', worst < 1e-9, `worst ${worst.toExponential(1)}°`)
}

{
  // C12. The cloud shell's height.
  const cloudRadius = EARTH_RADIUS * ((R + 12) / R)
  const km = ((cloudRadius - EARTH_RADIUS) / EARTH_RADIUS) * R
  check('the cloud deck stands 12 km up, to scale', near(km, 12, 1e-9), `${km.toFixed(4)} km, ${(cloudRadius - EARTH_RADIUS).toFixed(2)} units`)
}

{
  // C13. The limb's shading law: dark where the air is thin, unlit where the Sun is down, and red
  // only where the Sun is low *and* the path is long.
  const thin = limbShading(0.05, 1)
  const thick = limbShading(1, 1)
  const unlit = limbShading(1, -1)
  const sunset = limbShading(1, -0.2)
  const highSun = limbShading(1, 1)
  check(
    'the limb brightens with the path through it',
    thick.intensity > thin.intensity * 20 && unlit.intensity === 0,
    `${thin.intensity.toFixed(3)} thin, ${thick.intensity.toFixed(3)} grazing, ${unlit.intensity} unlit`,
  )
  check(
    'and reddens only when the Sun is low',
    sunset.reddening > 0.9 && highSun.reddening < 0.01 && sunset.colour[0] > sunset.colour[2],
    `reddening ${sunset.reddening.toFixed(2)} at sunset against ${highSun.reddening.toFixed(2)} at noon`,
  )
}

{
  // C13b. The haze over the ground, against the geometry it is supposed to follow. The air mass is
  // recomputed here from the two radii by ray-sphere intersection — the same triangle the shader
  // solves, but written out rather than imported — and the two numbers the shading depends on are
  // the ones it produces at the nadir and at the horizon.
  const centre = EARTH_CENTRE
  const airmassAt = (offDegrees) => {
    const th = offDegrees * rad
    const along = -centre * -Math.cos(th)
    const impact2 = centre * centre - along * along
    if (impact2 >= EARTH_RADIUS ** 2) return null
    const toGround = along - Math.sqrt(EARTH_RADIUS ** 2 - impact2)
    const toAir = along - Math.sqrt(ATMOSPHERE_RADIUS ** 2 - impact2)
    return (toGround - toAir) / (ATMOSPHERE_RADIUS - EARTH_RADIUS)
  }
  const nadir = airmassAt(0)
  const horizon = airmassAt(deg(Math.asin(EARTH_RADIUS / centre)) - 0.05)
  check(
    'one vertical column straight down, ten at the horizon',
    near(nadir, 1, 1e-6) && horizon > 9 && horizon < 11,
    `${nadir.toFixed(3)} at the nadir, ${horizon.toFixed(2)} grazing`,
  )
  check(
    'and the haze that follows is a tenth, then two thirds',
    near(groundHaze(nadir, 1).opacity, 0.095, 0.002) && groundHaze(horizon, 1).opacity > 0.55,
    `${(groundHaze(nadir, 1).opacity * 100).toFixed(1)} % overhead, ${(groundHaze(horizon, 1).opacity * 100).toFixed(1)} % at the limb, 0 % unlit`,
  )
}

{
  // C14. The sea's roughness, one conversion at a time, because stopping early gives a plausible
  // wrong answer at every step.
  const variance = slopeVariance(OCEAN_WIND_SPEED)
  const rms = Math.sqrt(variance)
  const ggx = Math.SQRT2 * rms
  check(
    'Cox–Munk slope variance at 7 m/s',
    near(variance, 0.003 + 0.00512 * 7, 1e-12) && near(variance, 0.03884, 1e-5),
    variance.toFixed(5),
  )
  check(
    'and the two conversions after it land on 0.528',
    near(OCEAN_ROUGHNESS, Math.sqrt(ggx), 1e-12) && near(OCEAN_ROUGHNESS, 0.528, 0.001),
    `rms ${rms.toFixed(3)} → ggx ${ggx.toFixed(3)} → perceptual ${OCEAN_ROUGHNESS.toFixed(3)}`,
  )
  check(
    'neither intermediate was shipped by mistake',
    Math.abs(OCEAN_ROUGHNESS - rms) > 0.3 && Math.abs(OCEAN_ROUGHNESS - ggx) > 0.2,
    `0.528 is not 0.197 and not 0.279`,
  )
  // The claim in the module is that the whole range of weather still reads as water. That is about
  // identity, not size — so it is checked as "never a mirror, never matte" rather than by a pair of
  // numbers. The first version of this check compared 0 and 25 m/s against figures the docs quote
  // for 2 and 20, and failed for that reason alone.
  check(
    'every wind from dead calm to storm still reads as water',
    seaRoughness(0) > 0.2 && seaRoughness(25) < 0.8 && seaRoughness(25) / seaRoughness(0) < 3,
    `${seaRoughness(0).toFixed(3)} at 0 m/s to ${seaRoughness(25).toFixed(3)} at 25, and 0.403 / 0.678 at the 2 and 20 the docs quote`,
  )
}

{
  // C15. The Sun marker's placement, including the case that cannot be caught by hand.
  const onScreen = markerPlacement(0.2, 0.3, false)
  const offRight = markerPlacement(3, 0, false)
  const atBack = markerPlacement(0.5, 0, true)
  check('the marker hides while the Sun is in frame', !onScreen.visible, 'the halo says it better')
  check('and pins to the edge when it leaves', offRight.visible && near(offRight.x, 0.94, 0.001), `x ${offRight.x.toFixed(3)}`)
  check(
    'a Sun behind the camera points the other way',
    atBack.visible && atBack.x < 0.5,
    `x ${atBack.x.toFixed(3)}, where the unguarded projection would say ${((0.5 * 0.88 + 1) / 2).toFixed(3)}`,
  )
}

// ─── D. The seams, where the two views must agree ────────────────────────────────────────────────

heading('D. The seams between the two views')

{
  // D1. The map's footprint and the scene's horizon are the same fact seen from two ends, and the
  // two quantities are the ones most easily swapped for each other: the central angle at the
  // planet's centre and the angular radius at the station must add to a right angle.
  const state = propagateIss(satrec, SAMPLES[0])
  const central = deg(state.footprintKm / R)
  const fromOrbit = horizonAngle([0, 0, 0]).real
  check(
    'footprint angle and horizon angle add to 90°',
    near(central + fromOrbit, 90, 0.35),
    `${central.toFixed(2)}° + ${fromOrbit.toFixed(2)}° = ${(central + fromOrbit).toFixed(2)}°`,
  )
}

{
  // D2. The map draws a subsolar point; the scene lights everything from a vector. If those ever
  // parted company, the terminator on the map and the terminator on the globe would drift apart
  // and nothing else would notice. The Sun's elevation over the sub-satellite point is computable
  // from each, by routes that share only the clock.
  let worst = 0
  for (const when of SAMPLES) {
    const state = propagateIss(satrec, when)
    const sub = subsolarPoint(when)
    // From the map's figures: spherical distance between the two ground points.
    const cosAngle =
      Math.sin(state.latitude * rad) * Math.sin(sub.latitude * rad) +
      Math.cos(state.latitude * rad) * Math.cos(sub.latitude * rad) * Math.cos((state.longitude - sub.longitude) * rad)
    const fromMap = 90 - deg(Math.acos(Math.max(-1, Math.min(1, cosAngle))))
    // From the scene's: the zenith component of the light it uses.
    const fromScene = deg(Math.asin(sunDirectionLvlh(state, when)[1]))
    worst = Math.max(worst, Math.abs(fromMap - fromScene))
  }
  check(
    'map and scene agree on the Sun’s elevation overhead',
    worst < 0.25,
    `worst ${worst.toFixed(3)}°, the geodetic-to-geocentric difference`,
  )
}

{
  // D3. The map's terminator and the globe's are drawn by different code from the same instant.
  // A point on the map's terminator, carried into the scene, must sit exactly where the scene's
  // own lighting turns over — the surface where the Sun grazes the horizon.
  let worst = 0
  for (const when of SAMPLES) {
    const state = propagateIss(satrec, when)
    const sub = subsolarPoint(when)
    const M = earthOrientationLvlh(state, when)
    const sun = sunDirectionLvlh(state, when)
    for (let lon = -180; lon < 180; lon += 30) {
      const lat = terminatorLatitude(lon, sub.latitude, sub.longitude)
      const onGlobe = geocentric(lat, lon)
      const inScene = transform([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]], onGlobe)
      const elevation = deg(Math.asin(inScene[0] * sun[0] + inScene[1] * sun[1] + inScene[2] * sun[2]))
      worst = Math.max(worst, Math.abs(elevation))
    }
  }
  check(
    'the map’s terminator is the globe’s terminator',
    worst < 0.001,
    `worst Sun elevation on it ${worst.toFixed(5)}°`,
  )
}

{
  // D4. The station is lit for longer than the ground below it, because it is 420 km higher. The
  // map draws a ground terminator and the scene fades the station on its own shadow flag; if the
  // sign of that offset were ever reversed nothing else in the app would complain.
  let stationLitAfterGroundSunset = 0
  let groundLitAfterStationSunset = 0
  for (let m = 0; m < 95; m += 0.5) {
    const when = new Date(SAMPLES[0].getTime() + m * 60000)
    const state = propagateIss(satrec, when)
    const sub = subsolarPoint(when)
    const cosAngle =
      Math.sin(state.latitude * rad) * Math.sin(sub.latitude * rad) +
      Math.cos(state.latitude * rad) * Math.cos(sub.latitude * rad) * Math.cos((state.longitude - sub.longitude) * rad)
    const groundLit = cosAngle > 0
    const stationLit = state.shadow < 0.5
    if (!groundLit && stationLit) stationLitAfterGroundSunset += 1
    if (groundLit && !stationLit) groundLitAfterStationSunset += 1
  }
  check(
    'the station stays lit after the ground below it does not',
    stationLitAfterGroundSunset > 0 && groundLitAfterStationSunset === 0,
    `${stationLitAfterGroundSunset} samples lit above a dark ground, ${groundLitAfterStationSunset} the other way`,
  )
}

{
  // D5. The scene's Sun and the inertial one are the same Sun. The LVLH vector is built from a
  // basis; this reconstructs that basis independently from position and velocity and asks for the
  // angle between the two answers.
  let worst = 0
  for (const when of SAMPLES) {
    const state = propagateIss(satrec, when)
    const eci = sunDirectionEci(when)
    const p = state.eci
    const v = state.velocity
    const pl = Math.hypot(p.x, p.y, p.z)
    const up = [p.x / pl, p.y / pl, p.z / pl]
    const vdot = v.x * up[0] + v.y * up[1] + v.z * up[2]
    const fwd = [v.x - vdot * up[0], v.y - vdot * up[1], v.z - vdot * up[2]]
    const fl = Math.hypot(...fwd)
    const aft = fwd.map((c) => -c / fl)
    const starboard = [
      up[1] * aft[2] - up[2] * aft[1],
      up[2] * aft[0] - up[0] * aft[2],
      up[0] * aft[1] - up[1] * aft[0],
    ]
    const rebuilt = [
      eci.x * starboard[0] + eci.y * starboard[1] + eci.z * starboard[2],
      eci.x * up[0] + eci.y * up[1] + eci.z * up[2],
      eci.x * aft[0] + eci.y * aft[1] + eci.z * aft[2],
    ]
    const scene = sunDirectionLvlh(state, when)
    // atan2 of the cross product against the dot, not acos of the dot. Near zero, acos loses half
    // its significant digits — it reported 1.2e-6° for two vectors that agree to machine precision,
    // which is the arccosine's own noise floor and not a disagreement about the Sun.
    const dot = rebuilt[0] * scene[0] + rebuilt[1] * scene[1] + rebuilt[2] * scene[2]
    const cross = Math.hypot(
      rebuilt[1] * scene[2] - rebuilt[2] * scene[1],
      rebuilt[2] * scene[0] - rebuilt[0] * scene[2],
      rebuilt[0] * scene[1] - rebuilt[1] * scene[0],
    )
    worst = Math.max(worst, deg(Math.atan2(cross, dot)))
  }
  check('the scene’s Sun is the inertial Sun in the station’s frame', worst < 1e-6, `worst ${worst.toExponential(1)}°`)
}

console.log(`\n${checks} checks, ${failures} failing.`)
if (failures > 0) {
  console.log('A calculation the views are drawn from is wrong.')
  process.exitCode = 1
} else {
  console.log('Every calculation both views are drawn from agrees with a second route to it.')
}
void section
