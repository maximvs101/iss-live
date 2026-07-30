/**
 * Checks the orbital engine against an independent source.
 *
 * The Celestrak elements are propagated with the application's own code
 * (src/orbit/propagator.ts) and compared with the wheretheiss.at API, which computes the same
 * thing on its side. A discrepancy of a few hundredths of a degree is expected (slightly different
 * elements and reference instants); several degrees would signal a frame or conversion error.
 *
 * Usage: node scripts/verify-orbit.mjs
 */
import { propagateIss, betaAngle, subsolarPoint } from '../src/orbit/propagator.ts'
import { twoline2satrec } from 'satellite.js'

const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'
const WHERE_THE_ISS = 'https://api.wheretheiss.at/v1/satellites/25544'

/** Great-circle distance between two points, in kilometres. */
function greatCircleKm(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

const tleText = await (await fetch(CELESTRAK)).text()
const [name, line1, line2] = tleText.trim().split('\n').map((line) => line.trim())
const satrec = twoline2satrec(line1, line2)

const reference = await (await fetch(WHERE_THE_ISS)).json()
// wheretheiss.at timestamps its response in seconds: propagate to exactly the same instant.
const date = new Date(reference.timestamp * 1000)

const state = propagateIss(satrec, date)
if (!state) {
  console.error('propagation failed')
  process.exit(2)
}

const dLat = state.latitude - reference.latitude
const dLon = state.longitude - reference.longitude
const dAlt = state.altitude - reference.altitude
const distanceKm = greatCircleKm(state.latitude, state.longitude, reference.latitude, reference.longitude)

console.log(`object : ${name}`)
console.log(`instant: ${date.toISOString()}\n`)
console.log('                    computed       reference       delta')
console.log(
  `latitude  (deg)  ${state.latitude.toFixed(5).padStart(12)} ${reference.latitude.toFixed(5).padStart(14)} ${dLat.toFixed(5).padStart(10)}`,
)
console.log(
  `longitude (deg)  ${state.longitude.toFixed(5).padStart(12)} ${reference.longitude.toFixed(5).padStart(14)} ${dLon.toFixed(5).padStart(10)}`,
)
console.log(
  `altitude   (km)  ${state.altitude.toFixed(2).padStart(12)} ${reference.altitude.toFixed(2).padStart(14)} ${dAlt.toFixed(2).padStart(10)}`,
)
console.log(
  `speed    (km/h)  ${(state.speed * 3600).toFixed(0).padStart(12)} ${reference.velocity.toFixed(0).padStart(14)}`,
)
console.log(`\nground distance between the two positions: ${distanceKm.toFixed(2)} km`)
console.log(`orbital period : ${state.periodMinutes.toFixed(2)} min`)
console.log(`ground footprint: ${state.footprintKm.toFixed(0)} km`)
console.log(`beta angle : ${betaAngle(state, date).toFixed(2)} deg`)
console.log(`shadow fraction: ${state.shadow.toFixed(3)} (${state.shadow < 0.5 ? 'sunlit' : 'in shadow'})`)
console.log(`visibility per reference: ${reference.visibility}`)
const subsolar = subsolarPoint(date)
console.log(
  `subsolar point : ${subsolar.latitude.toFixed(2)} deg lat, ${subsolar.longitude.toFixed(2)} deg lon`,
)

const TOLERANCE_KM = 25
if (distanceKm > TOLERANCE_KM) {
  console.error(`\nDISCREPANCY TOO LARGE: ${distanceKm.toFixed(1)} km > ${TOLERANCE_KM} km`)
  process.exit(1)
}
console.log(`\nAgrees with the independent source (< ${TOLERANCE_KM} km).`)
