/**
 * Runs the verification scripts together instead of one after another.
 *
 * They were a list in a README and a habit of typing ten commands, which cost the sum of their
 * runtimes when it should cost the longest. Measured before this existed: the four offline scripts
 * are 0 to 1 second each and the six that touch the network are the whole bill, so serial execution
 * spent minutes waiting on sockets that could all have been open at once.
 *
 * Two groups, because they answer different questions:
 *
 *   offline   pure arithmetic and files on disk. Nothing to wait for, safe in CI, and the right
 *             thing to run on every change.
 *   live      Celestrak, NASA's image library, and the Lightstreamer broadcast. These can fail for
 *             reasons that are nothing to do with the code — and one of them, the array pointing,
 *             deliberately waits to see whether a joint is moving.
 *
 * Usage:  npm run verify           offline and live, in parallel
 *         npm run verify:fast      offline only, well under a second
 *         npm run verify:live      network only
 *         npm run verify:plottable the five-minute survey, on its own, when it is wanted
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Which scripts exist, read from package.json rather than listed here.
 *
 * The first version of this file kept its own list and got a filename wrong — `verify-model.mjs`
 * against the real `verify-model-mapping.mjs` — so the runner reported a failure that was its own.
 * The scripts are already declared in one place; a second copy is only somewhere for them to drift.
 */
const manifest = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')).scripts

/** Live: needs the network, and may fail for reasons outside this repository. */
const LIVE = new Set(['orbit', 'telemetry', 'arrays', 'media'])

/**
 * Surveys, which are not regression checks and are not in the routine run.
 *
 * `plottable` holds a subscription open for five minutes to see whether every channel offered on a
 * chart actually varies. That window is the point of it — the slow symbols need the time — and it
 * also made it 300 s of a 301 s run, so the whole suite cost what this one script costs.
 *
 * Taking it out of the routine run left nothing checking that a chart has anything to draw, so it
 * has a name of its own: `npm run verify:survey`. Worth running after any change to the plottable
 * list, and worth running now and then regardless.
 */
const SURVEY = new Set(['plottable', 'survey'])

const declared = Object.entries(manifest)
  .filter(([name]) => name.startsWith('verify:') && !['verify:fast', 'verify:live'].includes(name))
  .map(([name, command]) => [name.slice('verify:'.length), command.replace(/^node\s+/, '')])

const all = declared.filter(([name]) => !SURVEY.has(name))
const OFFLINE = all.filter(([name]) => !LIVE.has(name))
const LIVE_SCRIPTS = all.filter(([name]) => LIVE.has(name))

const wanted = process.argv[2] ?? 'all'
const scripts = wanted === 'fast' ? OFFLINE : wanted === 'live' ? LIVE_SCRIPTS : all

/** One child, its output held until it finishes so two scripts cannot interleave a sentence. */
function run([name, file]) {
  return new Promise((done) => {
    const started = Date.now()
    const child = spawn(process.execPath, [resolve(here, '..', file)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (d) => (output += d))
    child.stderr.on('data', (d) => (output += d))
    child.on('close', (code) => {
      done({ name, code, output, seconds: (Date.now() - started) / 1000 })
    })
  })
}

console.log(`Verifying — ${scripts.length} scripts, together rather than in turn.\n`)

const started = Date.now()
const results = await Promise.all(scripts.map(run))
const wall = (Date.now() - started) / 1000
const serial = results.reduce((sum, r) => sum + r.seconds, 0)

for (const r of results.filter((r) => r.code !== 0)) {
  console.log(`──────── ${r.name} failed ────────`)
  console.log(r.output.trimEnd())
  console.log('')
}

const width = Math.max(...results.map((r) => r.name.length))
for (const r of results.sort((a, b) => b.seconds - a.seconds)) {
  console.log(`  [${r.code === 0 ? 'ok  ' : 'FAIL'}] ${r.name.padEnd(width)}  ${r.seconds.toFixed(1)} s`)
}

const failed = results.filter((r) => r.code !== 0)
console.log(`\n  ${wall.toFixed(1)} s wall against ${serial.toFixed(1)} s of work — ${(serial / wall).toFixed(1)}× from running them together.`)

if (failed.length) {
  console.log(`\n${failed.length} of ${results.length} failed: ${failed.map((r) => r.name).join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`\nAll ${results.length} pass.`)
}
