/**
 * Computes the upcoming ISS passes over a place and checks them for consistency.
 *
 * Two kinds of check run here. The physical ones are automatic: a pass cannot last longer than
 * the geometry allows, cannot exceed 90 degrees of elevation, cannot rise and set on the same
 * bearing, and two passes cannot be closer together than one orbit. The comparison against an
 * external source (Heavens-Above, N2YO) has to be done by eye, which is why the times below are
 * printed in a form that can be pasted next to theirs.
 *
 * Usage: node scripts/verify-passes.mjs [latitude] [longitude] [hours]
 */
import { twoline2satrec } from 'satellite.js'
import { compassPoint, findPasses } from '../src/orbit/passes.ts'

const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'

const latitude = Number(process.argv[2] ?? 48.8566)
const longitude = Number(process.argv[3] ?? 2.3522)
const hours = Number(process.argv[4] ?? 72)

const tleText = await (await fetch(CELESTRAK)).text()
const [name, line1, line2] = tleText.trim().split('\n').map((line) => line.trim())
const satrec = twoline2satrec(line1, line2)

const observer = { latitude, longitude, altitudeM: 35 }
const from = new Date()

const started = Date.now()
const passes = findPasses(satrec, observer, from, { hours, minElevation: 10 })
const elapsed = Date.now() - started

console.log(`object   : ${name}`)
console.log(`observer : ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
console.log(`window   : ${hours} h from ${from.toISOString()}`)
console.log(`computed : ${passes.length} passes above 10° in ${elapsed} ms\n`)

// Printed in UTC, so the times can be pasted straight next to an external source without a
// timezone shift getting in the way — a two-hour offset once made a correct result look wrong.
const fmt = (date) =>
  date.toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

for (const pass of passes) {
  const tag = pass.visible ? 'VISIBLE' : '       '
  const mag = pass.brightestMagnitude !== null ? `mag ${pass.brightestMagnitude.toFixed(1)}` : '—'
  console.log(
    `${tag}  ${fmt(pass.start.date)} → ${fmt(pass.end.date)}  ` +
      `max ${pass.maxElevation.toFixed(0).padStart(2)}°  ` +
      `${compassPoint(pass.start.azimuth)}→${compassPoint(pass.end.azimuth)}  ` +
      `${Math.round(pass.durationSeconds / 60)} min  ${mag}`,
  )
}

console.log('\n--- consistency checks ---')
let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}

check('at least one pass found', passes.length > 0, `${passes.length}`)

const tooLong = passes.filter((pass) => pass.durationSeconds > 11 * 60)
check(
  'no pass longer than 11 minutes',
  tooLong.length === 0,
  tooLong.map((p) => `${Math.round(p.durationSeconds / 60)} min`).join(', '),
)

const tooHigh = passes.filter((pass) => pass.maxElevation > 90)
check('no elevation above 90°', tooHigh.length === 0)

// Passes over one place come no closer than one orbital period apart.
const gaps = passes.slice(1).map((pass, i) => (pass.start.date - passes[i].end.date) / 60000)
const tooClose = gaps.filter((gap) => gap < 80)
check('passes at least 80 minutes apart', tooClose.length === 0, tooClose.map((g) => `${g.toFixed(0)} min`).join(', '))

// A pass crosses the sky: it cannot rise and set on nearly the same bearing.
const bearingSpread = (pass) =>
  Math.abs(((pass.end.azimuth - pass.start.azimuth + 540) % 360) - 180)
const sameBearing = passes.filter((pass) => bearingSpread(pass) < 20)
check(
  'rise and set bearings differ',
  sameBearing.length === 0,
  sameBearing.map((p) => `${bearingSpread(p).toFixed(0)}°`).join(', '),
)

// Visibility requires darkness at the observer and sunlight on the station.
const badVisible = passes.filter(
  (pass) => pass.visible && pass.culmination.sunElevation > 0,
)
check('no visible pass in broad daylight', badVisible.length === 0)

const visible = passes.filter((pass) => pass.visible)
console.log(`\n  [info] ${visible.length} of ${passes.length} passes are visible to the naked eye`)
if (visible.length > 0) {
  const brightest = visible.reduce((best, p) =>
    (p.brightestMagnitude ?? 99) < (best.brightestMagnitude ?? 99) ? p : best,
  )
  console.log(
    `  [info] brightest: ${fmt(brightest.start.date)}, mag ${brightest.brightestMagnitude?.toFixed(1)}, ` +
      `max ${brightest.maxElevation.toFixed(0)}°`,
  )
}

console.log('\nCompare the times above with heavens-above.com for the same coordinates.')

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`)
  process.exit(1)
}
