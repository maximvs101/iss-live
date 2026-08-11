/**
 * What the week actually recorded.
 *
 * The first duty of this report is to say how much of the week was real. A collector left running
 * through an outage produces a full-looking file of nothing, and the mistake to avoid is the one
 * already made once here: concluding "no split all week" from a stream that pushed nothing. So
 * uptime comes first, every question is answered against *live* minutes rather than elapsed ones,
 * and a question with too little live data behind it is reported as unanswered rather than answered
 * in the negative.
 */
import { readFileSync } from 'node:fs'

const DIR = new URL('../data/', import.meta.url)
const read = (name) => {
  try {
    return readFileSync(new URL(name, DIR), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

const liveness = read('collect-liveness.jsonl').sort((a, b) => a.at.localeCompare(b.at))
const events = read('collect-events.jsonl').sort((a, b) => a.at.localeCompare(b.at))

if (liveness.length === 0) {
  console.log('Nothing collected yet — run `npm run collect` first.')
  process.exit(0)
}

const from = liveness[0].at
const to = liveness[liveness.length - 1].at
const spanMin = (Date.parse(to) - Date.parse(from)) / 60_000

// ------------------------------------------------------------------ uptime

const liveMinutes = liveness.filter((l) => l.pushes > 0).length
const quietMinutes = liveness.filter((l) => l.pushes === 0).length
const uptime = liveMinutes / Math.max(1, liveMinutes + quietMinutes)

console.log(`Collected from ${from.slice(0, 16).replace('T', ' ')} to ${to.slice(0, 16).replace('T', ' ')} UTC`)
console.log(`${(spanMin / 60).toFixed(1)} hours elapsed, ${liveness.length} heartbeats\n`)
console.log(`broadcast up   : ${liveMinutes} min  (${(uptime * 100).toFixed(1)} %)`)
console.log(`broadcast quiet: ${quietMinutes} min`)
console.log(`sessions opened: ${Math.max(...liveness.map((l) => l.sessions ?? 0))}`)

/** The outages, as runs of consecutive quiet minutes. */
const gaps = []
let run = null
for (const beat of liveness) {
  if (beat.pushes === 0) {
    run ??= { from: beat.at, minutes: 0 }
    run.minutes += 1
  } else if (run) {
    gaps.push(run)
    run = null
  }
}
if (run) gaps.push(run)

const notable = gaps.filter((g) => g.minutes >= 5).sort((a, b) => b.minutes - a.minutes)
if (notable.length) {
  console.log(`\ninterruptions of five minutes or more (${notable.length}):`)
  for (const g of notable.slice(0, 12)) {
    console.log(`  ${g.from.slice(0, 16).replace('T', ' ')}  ${String(g.minutes).padStart(4)} min`)
  }
}

// ------------------------------------------------- question one: the split

const WINGS = ['1A', '3A', '1B', '3B', '2A', '4A', '2B', '4B']
const voltEvents = events.filter((e) => e.what?.endsWith(' volts'))
const changes = voltEvents.filter((e) => !e.snapshot)

console.log(`\n--- the voltage split ---\n`)
console.log(`${changes.length} voltage changes recorded across ${liveMinutes} live minutes.`)

if (liveMinutes < 60) {
  console.log('Too little live data to say anything. Not an answer, an absence of one.')
} else if (changes.length === 0) {
  console.log(
    'Not one of the eight moved in all that live time, which is itself the finding: these\n' +
      'channels do not report, they hold. That is a different fact from "never split", and the\n' +
      'question about what selects the high group cannot be asked of them at all.',
  )
} else {
  /** Reconstruct the eight voltages at each change and measure the spread. */
  const current = new Map()
  let widest = { spread: 0, at: null }
  let splitMinutes = 0
  for (const e of voltEvents) {
    current.set(e.what.slice(0, 2), Number.parseFloat(e.value))
    const vals = WINGS.map((w) => current.get(w)).filter((v) => Number.isFinite(v))
    if (vals.length < 8) continue
    const spread = Math.max(...vals) - Math.min(...vals)
    if (spread >= 2) splitMinutes += 1
    if (spread > widest.spread) widest = { spread, at: e.at }
  }
  console.log(`widest spread seen: ${widest.spread.toFixed(2)} V at ${widest.at?.slice(0, 16).replace('T', ' ')}`)
  console.log(
    widest.spread >= 2
      ? `\nThe split happened. Pair it with the wing pointing at that instant — verify:arrays\n` +
          'computes that from the model; do not derive it from the gimbal angle.'
      : '\nThe eight moved but never parted by more than 2 V. The split did not occur this week.',
  )
}

// --------------------------------------- question two: the stalled sensors

console.log(`\n--- the sensors that were weeks behind ---\n`)
const SENSORS = ['destiny ppO2', 'destiny ppCO2', 'tranquility ppO2', 'tranquility ppCO2', 'o2 production', 'station mass']
for (const name of SENSORS) {
  const own = events.filter((e) => e.what === name)
  const real = own.filter((e) => !e.snapshot)
  const last = own[own.length - 1]
  console.log(
    `${name.padEnd(20)} ${String(real.length).padStart(4)} change(s)   ` +
      `last value ${(last?.value ?? '—').slice(0, 12)}`,
  )
}
console.log(
  '\nA sensor with no changes re-sent the same reading all week. One with changes has resumed,\n' +
    'and the partial-pressure sum can be a check again rather than an observation.',
)
