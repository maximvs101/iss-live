/**
 * Samples the array voltage split across one whole orbit, instead of once a day.
 *
 * The daily capture answers "is it split right now", and the split has been seen once in five. A
 * week of those is seven more coin flips. But the thing under test is almost certainly orbital: the
 * station crosses into eclipse and back out every 93 minutes, the wings turn through a full
 * revolution of the SARJ in the same time, and the one split ever seen was in sunlight. Sampling
 * *within* an orbit asks what a week of daily samples cannot — at which point of the orbit it
 * happens, and whether it tracks the crossing.
 *
 * Nineteen captures five minutes apart covers 95 minutes, which is one full orbit and a little
 * over. Each one is a real subscription taking about 25 seconds, so the run occupies an hour and a
 * half of wall clock and almost none of the machine.
 *
 * The orbital elements are fetched once here and handed down. Twenty requests to Celestrak for the
 * same object inside two hours is what their guidance asks people not to do.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const ANALYSE = resolve(here, 'analyse-power-split.mjs')
const LOG = resolve(here, '../data/power-split.jsonl')
const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'

/**
 * One orbit is 92.9 minutes; 19 samples five minutes apart covers it with a little to spare.
 *
 * Both are overridable, which exists so the script itself can be smoke-tested in a minute rather
 * than an hour and a half — a ninety-minute run is a poor way to discover a typo in the reporting.
 */
const SAMPLES = Number(process.env.ORBIT_SAMPLES ?? 19)
const INTERVAL_MS = Number(process.env.ORBIT_INTERVAL_S ?? 300) * 1000

const started = Date.now()
const before = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).length

const cadence =
  INTERVAL_MS >= 60_000 ? `${(INTERVAL_MS / 60_000).toFixed(0)} min` : `${INTERVAL_MS / 1000} s`
console.log(`Sampling one orbit: ${SAMPLES} captures, ${cadence} apart.`)
console.log('Fetching the orbital elements once, for all of them.\n')
const tle = await (await fetch(CELESTRAK)).text()

for (let i = 1; i <= SAMPLES; i += 1) {
  const run = spawnSync(process.execPath, [ANALYSE], {
    env: { ...process.env, ISS_TLE: tle },
    encoding: 'utf8',
  })

  // One line each, from the child's own output, so a long run stays readable.
  const out = run.stdout ?? ''
  const beta = /beta\s*:\s*(-?[\d.]+)°\s+shadow\s+([\d.]+)\s+\((\w+)\)/.exec(out)
  const spread = /spread across the eight:\s*([\d.]+) V/.exec(out)
  const stamp = new Date().toISOString().slice(11, 16)

  if (!spread) {
    console.log(`${String(i).padStart(2)}/${SAMPLES}  ${stamp}  no reading — ${run.status === 0 ? 'stream quiet?' : `exit ${run.status}`}`)
  } else {
    const v = Number(spread[1])
    console.log(
      `${String(i).padStart(2)}/${SAMPLES}  ${stamp}  ${(beta?.[3] ?? '?').padEnd(7)}` +
        `  spread ${v.toFixed(2).padStart(6)} V${v >= 2 ? '   <-- SPLIT' : ''}`,
    )
  }

  if (i < SAMPLES) await new Promise((r) => setTimeout(r, INTERVAL_MS))
}

// ------------------------------------------------------------------ report

const all = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const burst = all.slice(before)

console.log(`\n${burst.length} captures over ${((Date.now() - started) / 60_000).toFixed(0)} minutes.\n`)

const split = burst.filter((s) => s.spread >= 2)
const sunlit = burst.filter((s) => s.shadow < 0.5)
const eclipse = burst.filter((s) => s.shadow >= 0.5)

console.log(`  sunlit  ${String(sunlit.length).padStart(2)} captures, ${sunlit.filter((s) => s.spread >= 2).length} split`)
console.log(`  eclipse ${String(eclipse.length).padStart(2)} captures, ${eclipse.filter((s) => s.spread >= 2).length} split`)

if (split.length === 0) {
  console.log(
    '\nNo split anywhere in this orbit. That is worth more than a single daily capture saying the\n' +
      'same: it rules the whole orbit out rather than one moment of it, so whatever causes the\n' +
      'split was not present today at all.',
  )
} else {
  console.log('\nSplit captured. The pairing to make now is with each wing\'s own pointing, which')
  console.log('verify:arrays computes from the model — do not derive it from the gimbal angle.')
  for (const s of split) {
    console.log(`  ${s.at.slice(11, 16)}  beta ${s.beta.toFixed(1)}°  spread ${s.spread.toFixed(2)} V  ${s.shadow >= 0.5 ? 'eclipse' : 'sunlit'}`)
  }
}
