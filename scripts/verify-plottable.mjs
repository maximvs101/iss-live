/**
 * Is the curated list of plottable channels still the right list?
 *
 * `src/telemetry/plottable.ts` offers about thirty channels out of 163, and the reason each one is
 * there is that it *moves*. That is a claim about live data, so it goes stale on its own: a sensor
 * that stops reporting turns its entry into a flat line, and a sensor that comes back deserves an
 * entry it does not have. This opens a real session, watches every subscribed channel, and checks
 * the list against what actually arrived.
 *
 * The test is **staleness, not variation**. Counting distinct values over a few minutes was the
 * first attempt and it confuses a slow sensor with a dead one: a tank level that steps twice an
 * hour is perfectly good to plot, while a partial pressure re-sending a reading from three weeks
 * ago is not, and both look equally still in a five-minute window. So the check reads each
 * channel's own onboard timestamp — the station says when it last measured — and fails a channel
 * whose sensor has stopped producing. Distinct counts are still printed, as context.
 *
 * Also reported, as information rather than failure: an omitted channel that moves as much as the
 * ones on the list. Enumerated symbols and clocks are excluded there — a step function and a
 * running clock are legitimately not plot material, whatever their update rate.
 *
 *   node scripts/verify-plottable.mjs [--minutes 5]
 *
 * Needs network access, and needs the stream to be live: with nothing arriving every channel looks
 * frozen and the run reports that rather than failing everything.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(resolve(root, relative), 'utf8')

const BASE = 'https://push.lightstreamer.com/lightstreamer'
const PROTOCOL = 'LS_protocol=TLCP-2.5.0'
const CID = 'mgQkwtwdysogQz2BJ4Ji kOj2rm'
const SCHEMA = ['TimeStamp', 'Value', 'Status.Class']

const arg = process.argv.indexOf('--minutes')
const MINUTES = arg !== -1 ? Number(process.argv[arg + 1]) : 5

/**
 * How old a reading may be before its sensor counts as stopped.
 *
 * Generous on purpose. The plot shows an hour, so a sensor reporting every few minutes is fine and
 * one silent for a day is not; the stalled channels found on this stream are weeks behind, nowhere
 * near this line. Measured from the station's own timestamp, not from arrival — the stalled ones
 * keep arriving, which is exactly what makes them deceptive.
 */
const MAX_AGE_HOURS = 6

/** Distinct values above which an omitted channel is worth a second look. */
const CANDIDATE_DISTINCT = 20

/** Clocks: continuous, and meaningless as a curve. */
const CLOCKS = new Set(['TIME_000001', 'TIME_000002', 'USLAB000084', 'USLAB000085'])

// --- What the application declares -------------------------------------------------------

const catalog = JSON.parse(read('src/data/pui-catalog.json'))
const symbolByPui = new Map(catalog.symbols.map((s) => [s.pui, s]))

// Read as text rather than imported: these modules reach for `import.meta.env`, which does not
// exist outside Vite. The declarations are regular enough to parse.
const subsystemsSource = read('src/telemetry/subsystems.ts')
const declared = []
for (const match of subsystemsSource.matchAll(/pui: '([A-Z0-9_]+)',\s*\n?\s*label: '([^']*)'/g)) {
  declared.push({ pui: match[1], label: match[2] })
}
const CHANNELS = [...new Map(declared.map((c) => [c.pui, c])).values()]
const labelOf = (pui) => CHANNELS.find((c) => c.pui === pui)?.label ?? pui

const plottableSource = read('src/telemetry/plottable.ts')
const OFFERED = new Set([...plottableSource.matchAll(/^\s*'([A-Z0-9_]+)',/gm)].map((m) => m[1]))

console.log(`${OFFERED.size} channels offered for plotting, out of ${CHANNELS.length} subscribed.`)

// --- Capture -----------------------------------------------------------------------------

const items = CHANNELS.map((c) => c.pui)
const response = await fetch(`${BASE}/create_session.txt?${PROTOCOL}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ LS_adapter_set: 'ISSLIVE', LS_cid: CID, LS_send_sync: 'false' }).toString(),
})
if (!response.ok || !response.body) throw new Error(`session refused: HTTP ${response.status}`)

const reader = response.body.getReader()
const decoder = new TextDecoder()
const deadline = Date.now() + MINUTES * 60_000
const seen = new Map()
let buffer = ''
let sessionId = null
let updates = 0

console.log(`Watching for ${MINUTES} min…\n`)

while (Date.now() < deadline) {
  const { value, done } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\r\n')
  buffer = lines.pop() ?? ''

  for (const line of lines) {
    if (!line || line === 'PROBE' || line.startsWith('NOOP')) continue

    if (line.startsWith('CONOK,') && !sessionId) {
      sessionId = line.split(',')[1]
      await fetch(`${BASE}/control.txt?${PROTOCOL}&LS_session=${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          LS_reqId: '1',
          LS_op: 'add',
          LS_subId: '1',
          LS_mode: 'MERGE',
          LS_group: items.join(' '),
          LS_schema: SCHEMA.join(' '),
          LS_snapshot: 'true',
        }).toString(),
      })
      continue
    }
    if (line.startsWith('CONERR,')) throw new Error(line)

    if (line.startsWith('U,')) {
      updates += 1
      const [, , itemIndex, ...rest] = line.split(',')
      const fields = rest.join(',').split('|')
      const pui = items[Number(itemIndex) - 1]
      const previous = seen.get(pui)
      // TLCP sends an empty field when a value is unchanged since the last update.
      const raw = fields[1] === '' || fields[1] === undefined ? previous?.raw : fields[1]
      const distinct = previous?.distinct ?? new Set()
      if (raw !== undefined) distinct.add(raw)
      seen.set(pui, { raw, distinct, timestamp: fields[0] || previous?.timestamp })
    }
  }
}
await reader.cancel().catch(() => {})

// --- Verdict -----------------------------------------------------------------------------

if (updates === 0) {
  console.log('No updates at all — the public stream is quiet. Nothing can be judged from this run.')
  process.exit(0)
}

const distinctOf = (pui) => seen.get(pui)?.distinct.size ?? 0
const isEnumerated = (pui) => !!symbolByPui.get(pui)?.values

/**
 * How long ago the station says it took this reading, in hours.
 *
 * Per-symbol timestamps are hours since the start of the year; `TIME_000001` is milliseconds into
 * the same year, so it supplies "now" on the station's own clock and no local time is involved.
 */
const nowMs = Number.parseFloat(seen.get('TIME_000001')?.raw ?? '')
function ageHours(pui) {
  const stamp = Number.parseFloat(seen.get(pui)?.timestamp ?? '')
  if (!Number.isFinite(stamp) || !Number.isFinite(nowMs)) return null
  return nowMs / 3_600_000 - stamp
}

let failures = 0

console.log('Offered channels:')
for (const pui of [...OFFERED].sort((a, b) => distinctOf(b) - distinctOf(a))) {
  const age = ageHours(pui)
  // No timestamp at all is its own kind of broken — the eight array drive currents publish none.
  const stalled = age === null || age > MAX_AGE_HOURS
  if (stalled) failures += 1
  const shown = age === null ? 'no timestamp' : `${age.toFixed(1)} h old`
  console.log(
    `  ${stalled ? '[FAIL]' : '  ok  '} ${String(distinctOf(pui)).padStart(4)} distinct  ${shown.padStart(13)}  ${pui.padEnd(14)} ${labelOf(pui)}`,
  )
}

const candidates = CHANNELS.filter(
  (channel) =>
    !OFFERED.has(channel.pui) &&
    !isEnumerated(channel.pui) &&
    !CLOCKS.has(channel.pui) &&
    distinctOf(channel.pui) >= CANDIDATE_DISTINCT,
).sort((a, b) => distinctOf(b.pui) - distinctOf(a.pui))

if (candidates.length) {
  console.log(`\nMoving but not offered (${CANDIDATE_DISTINCT}+ distinct values) — deliberate, or missed?`)
  for (const channel of candidates) {
    console.log(`  ${String(distinctOf(channel.pui)).padStart(4)} distinct  ${channel.pui.padEnd(14)} ${channel.label}`)
  }
}

console.log(`\n${updates} updates received.`)
if (failures) {
  console.log(`FAIL — ${failures} offered channel(s) have not been measured for over ${MAX_AGE_HOURS} h.`)
  process.exitCode = 1
} else {
  console.log('PASS — every offered channel is being measured now.')
}
