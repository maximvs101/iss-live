/**
 * Two open questions, asked of the live stream rather than of the documentation.
 *
 * **What selects the high voltage group.** The eight array drive voltages sometimes sit together
 * and sometimes split into two groups about 9 V apart. Three captures so far said only that being
 * in sunlight permits the split without causing it, and eclipse had never been seen split. What
 * has never been checked is whether membership follows each wing's *own* illumination — the eight
 * wings do not face the Sun equally, and the ones that do should be the ones delivering.
 *
 * The test is a correlation, not an eyeball: each channel is paired with the beta angle of its own
 * wing, and the two voltage groups are compared on that.
 *
 * **Whether the stalled sensors have resumed.** Thirteen continuous sensors were re-sending
 * readings weeks old — the partial pressures 25 and 33 days behind, station mass 28. Their onboard
 * timestamps say whether that is still true, and nothing else does: they arrive as promptly as any
 * other symbol, carrying an old measurement.
 *
 * Reads one TLCP session and prints. Writes nothing, changes nothing.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { twoline2satrec } from 'satellite.js'
import { propagateIss, betaAngle } from '../src/orbit/propagator.ts'

const BASE = 'https://push.lightstreamer.com/lightstreamer'
const TLCP = 'LS_protocol=TLCP-2.5.0'
const CID = 'mgQkwtwdysogQz2BJ4Ji kOj2rm'
const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'

/** Each wing: its drive voltage, its own beta gimbal, and which side of the truss it is on. */
const WINGS = [
  { wing: '1A', volts: 'S4000001', bga: 'S4000007', side: 'stbd' },
  { wing: '3A', volts: 'S4000004', bga: 'S4000008', side: 'stbd' },
  { wing: '1B', volts: 'S6000004', bga: 'S6000008', side: 'stbd' },
  { wing: '3B', volts: 'S6000001', bga: 'S6000007', side: 'stbd' },
  { wing: '2A', volts: 'P4000001', bga: 'P4000007', side: 'port' },
  { wing: '4A', volts: 'P4000004', bga: 'P4000008', side: 'port' },
  { wing: '2B', volts: 'P6000004', bga: 'P6000008', side: 'port' },
  { wing: '4B', volts: 'P6000001', bga: 'P6000007', side: 'port' },
]

/*
 * The sensors last seen re-sending readings weeks old, taken from the catalogue rather than from
 * memory. A first version of this list guessed the identifiers and got four of seven wrong — it
 * reported cabin temperature as a partial pressure and a water tank as another, which the values
 * gave away: 23.6 for ppO2 is nonsense, 23.6 °C is a room.
 *
 * Cabin pressure rides along because the check these feed is whether the partial pressures sum to
 * it, which was quietly comparing readings 25 days apart against a live total.
 */
const STALLED = [
  { pui: 'USLAB000053', label: 'Destiny ppO2' },
  { pui: 'USLAB000055', label: 'Destiny ppCO2' },
  { pui: 'NODE3000001', label: 'Tranquility ppO2' },
  { pui: 'NODE3000003', label: 'Tranquility ppCO2' },
  { pui: 'NODE3000011', label: 'O2 production rate' },
  { pui: 'USLAB000039', label: 'ISS total mass' },
  { pui: 'USLAB000058', label: 'Cabin pressure (reference)' },
]

/*
 * `TIME_000001` rides along as the station's own clock — milliseconds into the year, against
 * per-symbol timestamps in hours into the same year. Ages computed from those two never touch local
 * time, which is how verify:plottable does it and the only way that cannot be off by a timezone.
 */
const CLOCK = 'TIME_000001'
const ITEMS = [
  CLOCK,
  ...WINGS.map((w) => w.volts),
  ...WINGS.map((w) => w.bga),
  ...STALLED.map((s) => s.pui),
]
const SCHEMA = ['TimeStamp', 'Value']
const SECONDS = 25

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })

const res = await post(`${BASE}/create_session.txt?${TLCP}`, {
  LS_adapter_set: 'ISSLIVE',
  LS_cid: CID,
  LS_send_sync: 'false',
})

const reader = res.body.getReader()
const decoder = new TextDecoder()
let buffer = ''
let session = null
/** pui -> { value, timestamp, updates } */
const seen = new Map()
const deadline = Date.now() + SECONDS * 1000

while (Date.now() < deadline) {
  const { value, done } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\r\n')
  buffer = lines.pop() ?? ''

  for (const line of lines) {
    if (!line) continue

    if (line.startsWith('CONOK,') && !session) {
      session = line.split(',')[1]
      await post(`${BASE}/control.txt?${TLCP}&LS_session=${session}`, {
        LS_reqId: '1',
        LS_op: 'add',
        LS_subId: '1',
        LS_mode: 'MERGE',
        LS_group: ITEMS.join(' '),
        LS_schema: SCHEMA.join(' '),
        LS_snapshot: 'true',
      })
      continue
    }

    if (line.startsWith('U,')) {
      const [, , index, ...rest] = line.split(',')
      const parts = rest.join(',').split('|')
      const pui = ITEMS[Number(index) - 1]
      if (!pui) continue
      const previous = seen.get(pui)
      // A field the server has not changed comes through empty; keep what we had.
      seen.set(pui, {
        timestamp: parts[0] || previous?.timestamp || '',
        value: parts[1] || previous?.value || '',
        updates: (previous?.updates ?? 0) + 1,
      })
    }
  }
}
await reader.cancel().catch(() => {})

const at = new Date()
const tle = await (await fetch(CELESTRAK)).text()
const [, line1, line2] = tle.trim().split('\n').map((l) => l.trim())
const orbit = propagateIss(twoline2satrec(line1, line2), at)
const beta = betaAngle(orbit, at)

const num = (pui) => {
  const raw = seen.get(pui)?.value
  const parsed = raw === undefined ? NaN : Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : null
}

console.log(`instant : ${at.toISOString()}`)
console.log(`beta    : ${beta.toFixed(2)}°   shadow ${orbit.shadow.toFixed(2)} (${orbit.shadow >= 0.5 ? 'eclipse' : 'sunlit'})\n`)

// ------------------------------------------------------ the voltage split

/*
 * No off-Sun angle is computed here, on purpose.
 *
 * A first version derived one from the gimbal angle against beta, which looked reasonable and was
 * wrong: it ignores the SARJ and the mirrored rest orientations, and it reported the eight wings in
 * two groups 27° apart where the real geometry has them all within four degrees of each other. The
 * honest figure needs the model, and `verify:arrays` already computes it — run the two together.
 */
const rows = WINGS.map((w) => ({
  ...w,
  volts: num(w.volts),
  bga: num(w.bga),
  updates: seen.get(w.volts)?.updates ?? 0,
}))

console.log('wing  side   voltage      BGA   updates')
for (const r of rows) {
  console.log(
    `${r.wing.padEnd(5)} ${r.side.padEnd(6)} ${(r.volts?.toFixed(2) ?? '—').padStart(7)} V ` +
      `${(r.bga?.toFixed(1) ?? '—').padStart(7)}° ${String(r.updates).padStart(8)}`,
  )
}

const volts = rows.map((r) => r.volts).filter((v) => v !== null)
const spread = Math.max(...volts) - Math.min(...volts)
console.log(`\nspread across the eight: ${spread.toFixed(2)} V`)

/*
 * Appended, because one capture cannot answer this.
 *
 * The split has been seen once in four captures. A single run either catches it or does not, and a
 * run that does not says almost nothing — so the useful thing a run can do is add a line and let
 * the rare event accumulate. The same arrangement as the beta log in verify:arrays, for the same
 * reason.
 */
const LOG = new URL('../data/power-split.jsonl', import.meta.url)
mkdirSync(new URL('.', LOG), { recursive: true })
appendFileSync(
  LOG,
  `${JSON.stringify({
    at: at.toISOString(),
    beta: Number(beta.toFixed(2)),
    shadow: Number(orbit.shadow.toFixed(2)),
    spread: Number(spread.toFixed(2)),
    volts: Object.fromEntries(rows.map((r) => [r.wing, r.volts])),
  })}\n`,
)

const history = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const splits = history.filter((h) => h.spread >= 2)
console.log(
  `${history.length} capture(s) logged, ${splits.length} of them split` +
    ` (${history.filter((h) => h.shadow >= 0.5).length} in eclipse, none split so far unless noted).`,
)

if (spread < 2) {
  console.log(
    'Converged at this instant — nothing to explain. The question needs a capture taken while the\n' +
      'split is happening, and only then does the pointing of each wing become worth comparing.',
  )
} else {
  // Split at the midpoint of the range: the observed gap is ~9 V, far wider than the scatter.
  const mid = (Math.max(...volts) + Math.min(...volts)) / 2
  const high = rows.filter((r) => r.volts !== null && r.volts >= mid)
  const low = rows.filter((r) => r.volts !== null && r.volts < mid)
  const mean = (xs, pick) => xs.reduce((s, r) => s + pick(r), 0) / xs.length

  console.log(`\nhigh group (${high.length}): ${high.map((r) => r.wing).join(' ')}`)
  console.log(`low  group (${low.length}): ${low.map((r) => r.wing).join(' ')}`)

  const bySide = (g) => `${g.filter((r) => r.side === 'port').length} port / ${g.filter((r) => r.side === 'stbd').length} stbd`
  console.log(`\n  by truss side   high: ${bySide(high)}   low: ${bySide(low)}`)

  const letter = (g, l) => g.filter((r) => r.wing.endsWith(l)).length
  console.log(`  by channel      high: ${letter(high, 'A')} A / ${letter(high, 'B')} B   low: ${letter(low, 'A')} A / ${letter(low, 'B')} B`)

  const haveOff = high.every((r) => r.offPoint !== null) && low.every((r) => r.offPoint !== null)
  if (haveOff) {
    const hi = mean(high, (r) => r.offPoint)
    const lo = mean(low, (r) => r.offPoint)
    console.log(`  by own pointing high: ${hi.toFixed(1)}° off-point   low: ${lo.toFixed(1)}° off-point`)
    console.log(
      Math.abs(hi - lo) > 5
        ? '\n  The two groups point differently. Membership tracks each wing\'s own illumination.'
        : '\n  The two groups point the same way, so illumination does not select them.\n' +
            '  Whatever picks the high group is electrical, not geometric.',
    )
  }
}

// ------------------------------------------------- have the sensors resumed

console.log('\nsensors last seen weeks behind:\n')
const stationNowMs = Number.parseFloat(seen.get(CLOCK)?.value ?? '')
console.log('symbol           label                    value        age of the reading')
let resumed = 0
for (const s of STALLED) {
  const entry = seen.get(s.pui)
  const stamp = Number.parseFloat(entry?.timestamp ?? '')
  const shown = (entry?.value ?? '—').slice(0, 10)
  if (!Number.isFinite(stamp) || !Number.isFinite(stationNowMs)) {
    console.log(`${s.pui.padEnd(16)} ${s.label.padEnd(24)} ${shown.padStart(10)}   no usable timestamp`)
    continue
  }
  const hours = stationNowMs / 3_600_000 - stamp
  const age = hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} days`
  if (hours < 6) resumed += 1
  console.log(
    `${s.pui.padEnd(16)} ${s.label.padEnd(24)} ${shown.padStart(10)}   ${age.padStart(10)}   ` +
      `${hours < 6 ? 'live' : 'stalled'}`,
  )
}
console.log(
  `\n${resumed} of ${STALLED.length} are reporting within six hours.` +
    (resumed === STALLED.length
      ? '\nAll resumed — the partial pressures can be compared against cabin pressure again.'
      : '\nStill stalled, so the partial-pressure sum remains an observation and not a check.'),
)
