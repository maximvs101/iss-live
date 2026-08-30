/**
 * The off-Sun offset of every wing, for every minute the collector recorded.
 *
 * `verify:arrays` answers the same question from a live session, one sample at a time, whenever
 * someone runs it. Thirteen samples in, they fall in three clusters of beta, and that is exactly
 * why the question is still open: a line through three clusters extrapolates rather than measures.
 *
 * The collector has been recording the inputs all along without being asked to — the eight gimbal
 * angles, the two rotary joints and the measured beta are all in its WATCH list. So the same
 * geometry runs over the stored record, which turns a handful of hand-taken samples into as many
 * as the record holds.
 *
 * **The geometry is imported, not rewritten.** The first attempt at this script derived it by hand
 * and read 45° to 90° off-Sun where the verified script reads 10° to 20°; the model carries scales
 * of 63.33 and 0.016 on the S6 chain and four differently-oriented parents, and no formula written
 * from the outside knows that. It shares `lib/array-geometry.mjs` with `verify:arrays`, and any
 * change to the mapping moves both at once.
 *
 * Rows store only what *changed*, so the state at each instant is rebuilt by carrying values
 * forward. That is exact rather than approximate: a symbol absent from a row is one that did not
 * move.
 *
 *     wrangler d1 execute iss-collector --remote --json --command \
 *       "SELECT at, changed FROM liveness WHERE changed IS NOT NULL ORDER BY at" > rows.json
 *     npm run analyse:offset -- rows.json
 */
import { readFileSync } from 'node:fs'
import { twoline2satrec } from 'satellite.js'
import { JOINT_BINDINGS } from '../src/scene/nasa/nodeMapping.ts'
import { WINGS, geometryAt, geometryFromState, measureAll } from './lib/array-geometry.mjs'

const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'

/** Above this the station stops Sun-pointing on purpose — NTRS 20180007791. */
const BACKTRACK_BETA = 40

/**
 * Coarser than the live check's 0.25°, because this runs thousands of times rather than once.
 *
 * A degree of sweep costs a degree of resolution on `ideal`, which the fitted slope does not
 * notice: the offsets being chased are ten to twenty degrees and their scatter within one beta
 * value is already four.
 */
const SWEEP_STEP = 1

/**
 * Past this much that no beta angle can remove, the alpha joints were not tracking.
 *
 * The same figure and the same reasoning as the live check's parked guard. It matters more here
 * because nobody is watching: unfiltered, the |beta| 31° bin ran to 73° off-Sun with 54° of it
 * irreducible — a minute when the truss was somewhere Sun-tracking would not have put it, averaged
 * in with 495 minutes when it was.
 */
const ALPHA_TOLERANCE = 15

/**
 * A tracking rotary joint turns about 4° a minute. Below this between two consecutive readings it
 * is parked, and the wings are wherever the crew left them.
 *
 * The irreducible residual alone does not catch this, and it was measured not caught: on 25 August
 * the starboard SARJ sat at exactly 124.8° for hours while the orbit carried the geometry around
 * it, so `irreducible` dipped under its threshold every few minutes and let the period through. It
 * landed in the |beta| 21° bin as 45.5° off the Sun against 4.3° on the way down — one bin out of
 * nine, and enough on its own to reverse the verdict of the whole comparison.
 *
 * The live check has always guarded this by reading the telemetry twice and seeing whether the
 * joints moved. Here the record already holds both readings.
 */
const SARJ_MOVED_MIN = 0.5
const STBD_SARJ = 'S0000003'

const file = process.argv[2]
if (!file) {
  console.error('usage: npm run analyse:offset -- rows.json')
  process.exit(2)
}

const rows = JSON.parse(readFileSync(file, 'utf8'))[0].results
const response = await fetch(CELESTRAK)
const [, line1, line2] = (await response.text()).trim().split('\n').map((line) => line.trim())
const satrec = twoline2satrec(line1, line2)

/**
 * The joints a wing's pointing actually depends on: its own gimbal, and the alpha joint carrying
 * the truss it hangs from.
 *
 * Not all twelve bindings. The two thermal joints swing the radiators and touch no wing, and the
 * collector does not subscribe to them — requiring them rejected all 496 rows and reported nothing,
 * which is a demand for data that was never relevant rather than a gap in the record.
 */
const REQUIRED = new Set(
  JOINT_BINDINGS.filter((binding) => /BETA_ROT|ALPHA_ROT/.test(binding.node)).map((b) => b.pui),
)
const PUIS = new Set(JOINT_BINDINGS.map((binding) => binding.pui))
const BETA_PUI = 'USLAB000040'

/**
 * The station's own J2000 state vector, when the record has it.
 *
 * Recorded from 30/08/2026. Before that the frame had to be propagated, and the results degrade
 * with the age of the element set used — see `geometryFromState`. Rows without it are still
 * measured, and counted separately so the split is visible rather than assumed away.
 */
const STATE_PUIS = ['USLAB000032', 'USLAB000033', 'USLAB000034', 'USLAB000035', 'USLAB000036', 'USLAB000037']

/** Carried forward: a symbol absent from a row is a symbol that did not move. */
const held = new Map()
const samples = []
let skippedIncomplete = 0
let notTracking = 0
let parked = 0
let fromStation = 0
let propagated = 0
let previousSarj = null
let previousAt = null

for (const row of rows) {
  for (const [pui, value] of Object.entries(JSON.parse(row.changed))) {
    if (PUIS.has(pui) || pui === BETA_PUI || STATE_PUIS.includes(pui)) {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) held.set(pui, numeric)
    }
  }
  // Every joint the wings depend on must be known, or they are being measured against a truss
  // position from before the record started.
  if (![...REQUIRED].every((pui) => held.has(pui))) {
    skippedIncomplete += 1
    continue
  }

  const at = new Date(row.at)
  const hasState = STATE_PUIS.every((pui) => held.has(pui))
  const geometry = hasState
    ? geometryFromState(
        STATE_PUIS.slice(0, 3).map((pui) => held.get(pui)),
        STATE_PUIS.slice(3).map((pui) => held.get(pui)),
        at,
      )
    : geometryAt(satrec, at)
  if (!geometry) continue
  if (hasState) fromStation += 1
  else propagated += 1

  const measured = measureAll(held, geometry.sun, SWEEP_STEP)
  if (measured.length < WINGS.length) continue

  const offsets = measured.map((wing) => wing.offset).sort((a, b) => a - b)
  const off = measured.map((wing) => wing.off).sort((a, b) => a - b)
  const worstIrreducible = Math.max(...measured.map((wing) => wing.irreducible))
  if (worstIrreducible > ALPHA_TOLERANCE) {
    notTracking += 1
    continue
  }

  // Did the truss actually turn since the previous reading? Gaps in the record are not evidence
  // either way, so only consecutive minutes can answer it.
  const sarj = held.get(STBD_SARJ)
  const minutesSince = previousAt === null ? Infinity : (at.getTime() - previousAt) / 60_000
  const turned = Math.abs(((sarj - previousSarj + 540) % 360) - 180)
  const consecutive = minutesSince <= 2 && previousSarj !== null
  previousSarj = sarj
  previousAt = at.getTime()
  if (consecutive && turned < SARJ_MOVED_MIN) {
    parked += 1
    continue
  }
  samples.push({
    at: row.at,
    beta: geometry.beta,
    published: held.get(BETA_PUI) ?? null,
    medianOff: off[Math.floor(off.length / 2)],
    meanOffset: offsets.reduce((sum, value) => sum + value, 0) / offsets.length,
    spread: offsets[offsets.length - 1] - offsets[0],
    worstIrreducible: Math.max(...measured.map((wing) => wing.irreducible)),
  })
}

console.log(
  `${samples.length} minutes measured, ${skippedIncomplete} skipped before all joints were known, ` +
    `${notTracking} dropped with the alpha joints not tracking\n`,
)
if (samples.length === 0) process.exit(0)

const betas = samples.map((sample) => Math.abs(sample.beta))
console.log(`|beta| covered: ${Math.min(...betas).toFixed(1)}° to ${Math.max(...betas).toFixed(1)}°`)
console.log(`samples above ${BACKTRACK_BETA}°: ${betas.filter((b) => b >= BACKTRACK_BETA).length}\n`)

/*
 * Binned by whole degrees of |beta| rather than fitted straight away.
 *
 * A fit assumes the shape. The bins show it — including the thing a fit would hide, which is that
 * two samples a degree of beta apart can differ by four degrees of offset.
 */
console.log('|beta|     n   median off-Sun   range          worst irreducible')
const bins = new Map()
for (const sample of samples) {
  const key = Math.round(Math.abs(sample.beta))
  bins.set(key, [...(bins.get(key) ?? []), sample])
}
for (const key of [...bins.keys()].sort((a, b) => a - b)) {
  const group = bins.get(key)
  const offs = group.map((s) => s.medianOff).sort((a, b) => a - b)
  const irr = Math.max(...group.map((s) => s.worstIrreducible))
  console.log(
    `${String(key).padStart(5)}°  ${String(group.length).padStart(5)}   ${offs[Math.floor(offs.length / 2)].toFixed(1).padStart(12)}°   ` +
      `${offs[0].toFixed(1)}–${offs[offs.length - 1].toFixed(1)}°`.padEnd(15) +
      `${irr.toFixed(1).padStart(6)}°`,
  )
}

const xs = samples.map((sample) => Math.abs(sample.beta))
const ys = samples.map((sample) => sample.medianOff)
const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
let sxy = 0
let sxx = 0
for (let i = 0; i < xs.length; i += 1) {
  sxy += (xs[i] - meanX) * (ys[i] - meanY)
  sxx += (xs[i] - meanX) ** 2
}
const slope = sxx === 0 ? 0 : sxy / sxx
const intercept = meanY - slope * meanX
const residual = Math.sqrt(
  ys.reduce((sum, y, i) => sum + (y - (slope * xs[i] + intercept)) ** 2, 0) / ys.length,
)
console.log(
  `\nfitted over ${samples.length} samples: off-Sun = ${slope.toFixed(3)} × |beta| + ${intercept.toFixed(1)}°` +
    `  (residual ${residual.toFixed(2)}°)`,
)

/*
 * The number that actually bounds a constant error, and the reason for collecting so many.
 *
 * A zero wrong by k degrees puts every wing at least k degrees off the Sun, always — there is no
 * geometry that recovers it. So the smallest off-Sun angle ever observed is an upper bound on k,
 * and one good minute bounds it more tightly than a thousand average ones. A fitted intercept
 * cannot do this: it extrapolates outside the sampled range and answers whatever the shape of the
 * curve inside it happens to suggest.
 */
const best = Math.min(...samples.map((sample) => sample.medianOff))
const bestAt = samples.find((sample) => sample.medianOff === best)
console.log(
  `\nclosest approach: ${best.toFixed(1)}° off the Sun at |beta| ${Math.abs(bestAt.beta).toFixed(1)}°,` +
    ` on ${bestAt.at.slice(0, 16).replace('T', ' ')}` +
    `\nA zero error of k degrees can never read better than k, so any constant error in the mapping` +
    `\nis at most ${best.toFixed(1)}°. Whatever the rest of the spread is, it is not a fixed offset.`,
)

if (betas.every((b) => b < BACKTRACK_BETA)) {
  console.log(
    `\nEvery sample sits below |beta| ${BACKTRACK_BETA}°, where the station is documented as` +
      '\nSun-pointing its wings. Backtracking cannot be what this offset is.',
  )
}

/*
 * The comparison the whole record was collected for.
 *
 * Beta falls to zero and rises again with the opposite sign, so the same |beta| is reached twice,
 * days apart. Binned on |beta| alone the two halves are averaged together and the question cannot
 * be asked; split by sign, it answers itself. If a given |beta| gives the same off-Sun angle on the
 * way down and on the way up, the offset is a function of beta. If it does not, it was a function
 * of the date and the curve was a coincidence.
 */
const descending = samples.filter((sample) => sample.beta < 0)
const ascending = samples.filter((sample) => sample.beta > 0)
const median = (list) => {
  const values = list.map((x) => x.medianOff).sort((a, b) => a - b)
  return values.length ? values[Math.floor(values.length / 2)] : null
}

if (descending.length > 20 && ascending.length > 20) {
  const span = (list) => `${list[0].at.slice(0, 10)} to ${list[list.length - 1].at.slice(0, 10)}`
  console.log(`\ndescending (beta < 0): ${descending.length} minutes, ${span(descending)}`)
  console.log(`ascending  (beta > 0): ${ascending.length} minutes, ${span(ascending)}`)
  console.log(`\n|beta|   descending   ascending   difference`)

  const gaps = []
  for (let key = 0; key <= 60; key += 1) {
    const down = descending.filter((x) => Math.round(Math.abs(x.beta)) === key)
    const up = ascending.filter((x) => Math.round(Math.abs(x.beta)) === key)
    if (down.length < 5 || up.length < 5) continue
    const a = median(down)
    const b = median(up)
    gaps.push(Math.abs(a - b))
    console.log(
      `${String(key).padStart(5)}°   ${a.toFixed(1).padStart(9)}°   ${b.toFixed(1).padStart(8)}°   ${(b - a).toFixed(1).padStart(9)}°`,
    )
  }

  if (gaps.length) {
    const mean = gaps.reduce((x, y) => x + y, 0) / gaps.length
    console.log(`\nmean difference over ${gaps.length} shared values of |beta|: ${mean.toFixed(1)}°`)
    console.log(
      mean < 3
        ? 'The two halves agree: the offset is a function of beta, not of the date.'
        : 'The two halves disagree: beta alone does not explain this offset.',
    )
  }
} else {
  console.log(
    `\nCaveat: ${descending.length} minutes at negative beta against ${ascending.length} at positive,` +
      `\nso beta and the calendar still move together and no trend can be attributed to either.`,
  )
}
