/**
 * Checks every subscribed telemetry channel against reality.
 *
 * Three kinds of check, in increasing order of strength:
 *
 *  1. **Plausibility** — is the value inside the documented operating range for that parameter?
 *     Weakest of the three: the range is something we assert, so a pass only means "not absurd".
 *  2. **Internal consistency** — do values that must agree, agree? The partial pressures of a
 *     module must sum to its total pressure; the two SARJ angles must describe the same joint
 *     pair; a saturation percentage must match the momentum and capacity it is computed from.
 *     These need no external source and no assumption of ours: the stream contradicts itself
 *     or it does not.
 *  3. **External agreement** — the station publishes its own J2000 state vector. Its magnitudes
 *     are compared against SGP4 propagation of Celestrak's elements, an entirely independent
 *     source. Magnitudes rather than components, because TEME and J2000 differ by the
 *     precession accumulated since 2000 (~0.37°, or ~44 km at this altitude) and comparing
 *     components without that rotation would measure our own omission.
 *
 * Usage: node scripts/verify-telemetry.mjs [--seconds 45]
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { UNIT_OVERRIDES } from '../src/telemetry/units.ts'
import { propagateIss, betaAngle } from '../src/orbit/propagator.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(resolve(root, relative), 'utf8')

const BASE = 'https://push.lightstreamer.com/lightstreamer'
const PROTOCOL = 'LS_protocol=TLCP-2.5.0'
const CID = 'mgQkwtwdysogQz2BJ4Ji kOj2rm'
const SCHEMA = ['TimeStamp', 'Value', 'Status.Class']

const durationArg = process.argv.indexOf('--seconds')
const DURATION_S = durationArg !== -1 ? Number(process.argv[durationArg + 1]) : 45

// --- What the application declares -------------------------------------------------------

const catalog = JSON.parse(read('src/data/pui-catalog.json'))
const symbolByPui = new Map(catalog.symbols.map((s) => [s.pui, s]))

// subsystems.ts cannot be imported here: it reads `import.meta.env`, which does not exist
// outside Vite. The declarations are regular enough to read as text.
//
// Read in two steps rather than with one pattern, and the reason is a channel this file lost.
//
// It matched `pui: '…',` followed by `label: '…'` with at most a newline between them, which is
// how every entry but one is written. `TIME_000001` carries a comment on the line between the
// two, so it never matched — and TIME_000001 is the station's clock, which is what every age in
// this report is measured against. Losing it failed nothing: `ageDays` returned null for all 162
// remaining channels, every age printed as "age unknown", and the stalled-sensor check reported
// **[ok] every continuous measurement is less than a day old** over an empty list, while the
// application's own freshness panel counted thirteen stopped sensors on the same stream.
//
// A pattern spanning two lines of a declaration is a pattern that breaks on a comment. This finds
// each `pui` and then the first `label` before the next one, which is what the structure promises.
const subsystemsSource = read('src/telemetry/subsystems.ts')
const channels = []
const puiMatches = [...subsystemsSource.matchAll(/pui: '([A-Z0-9_]+)'/g)]
for (const [index, match] of puiMatches.entries()) {
  const from = match.index + match[0].length
  const until = index + 1 < puiMatches.length ? puiMatches[index + 1].index : subsystemsSource.length
  const slice = subsystemsSource.slice(from, until)
  const label = /label: '([^']*)'/.exec(slice)
  // Declared where the labels are: this symbol's timestamp dates a change, not a measurement.
  channels.push({ pui: match[1], label: label ? label[1] : match[1], holds: /holds: true/.test(slice) })
}
const CHANNELS = [...new Map(channels.map((c) => [c.pui, c])).values()]

/** The clock every age is measured against. Named here because losing it is silent otherwise. */
const CLOCK = 'TIME_000001'
if (!CHANNELS.some((c) => c.pui === CLOCK)) {
  console.error(`\n  [FAIL] ${CLOCK} is not among the declared channels — every age reads "unknown".\n`)
  process.exit(1)
}

// --- Documented operating ranges ---------------------------------------------------------
//
// Each entry states where the range comes from. A value outside it is reported, not treated
// as proof of a bug: the station legitimately leaves nominal ranges (depressurised airlock,
// a joint parked, a loop shut down).

const RANGES = {
  // Atmosphere. ISS is held near sea-level pressure; NASA's flight rules keep ppO2 between
  // roughly 2.83 and 3.35 psi (146-173 mmHg) and ppCO2 below ~5.3 mmHg.
  USLAB000058: { min: 700, max: 790, unit: 'mmHg', what: 'cabin pressure near sea level (760)' },
  USLAB000053: { min: 140, max: 180, unit: 'mmHg', what: 'ppO2 flight-rule band' },
  NODE3000001: { min: 140, max: 180, unit: 'mmHg', what: 'ppO2 flight-rule band' },
  USLAB000054: { min: 500, max: 620, unit: 'mmHg', what: 'ppN2, the balance of the cabin' },
  NODE3000002: { min: 500, max: 620, unit: 'mmHg', what: 'ppN2, the balance of the cabin' },
  USLAB000055: { min: 0, max: 6, unit: 'mmHg', what: 'ppCO2 below the 5.3 limit' },
  NODE3000003: { min: 0, max: 6, unit: 'mmHg', what: 'ppCO2 below the 5.3 limit' },
  USLAB000059: { min: 17, max: 28, unit: '°C', what: 'crew comfort range' },

  // Power. The US segment primary bus is 160 V nominal.
  S4000001: { min: 130, max: 180, unit: 'V', what: '160 V primary bus' },
  S4000004: { min: 130, max: 180, unit: 'V', what: '160 V primary bus' },
  S6000004: { min: 130, max: 180, unit: 'V', what: '160 V primary bus' },
  S6000001: { min: 130, max: 180, unit: 'V', what: '160 V primary bus' },
  P4000001: { min: 130, max: 180, unit: 'V', what: '160 V primary bus' },
  P4000004: { min: 130, max: 180, unit: 'V', what: '160 V primary bus' },
  P6000004: { min: 130, max: 180, unit: 'V', what: '160 V primary bus' },
  P6000001: { min: 130, max: 180, unit: 'V', what: '160 V primary bus' },

  // Attitude. CMG flywheels run at a constant 6,600 rpm.
  Z1000009: { min: 6400, max: 6800, unit: 'rpm', what: 'CMG nominal 6,600 rpm' },
  Z1000010: { min: 6400, max: 6800, unit: 'rpm', what: 'CMG nominal 6,600 rpm' },
  Z1000011: { min: 6400, max: 6800, unit: 'rpm', what: 'CMG nominal 6,600 rpm' },
  Z1000012: { min: 6400, max: 6800, unit: 'rpm', what: 'CMG nominal 6,600 rpm' },
  // 420 t is the figure everyone quotes for the station alone. The published value has read
  // 472 t all along, and that is not an error: it is the station plus whatever is docked — a
  // Progress, a Cargo Dragon and a Soyuz together are 30 t of spacecraft and propellant, and the
  // symbol reports the stack. The old upper bound of 460 t made this the one warning the suite
  // emitted permanently, which is how a suite stops being read.
  USLAB000039: { min: 380000, max: 500000, unit: 'kg', what: 'ISS mass with docked vehicles, about 470 t' },
  USLAB000040: { min: -75, max: 75, unit: '°', what: 'solar beta angle stays within +/-75' },

  // Angles that are joint positions: any value in a full turn is legal.
  S0000003: { min: 0, max: 360, unit: '°', what: 'SARJ position' },
  S0000004: { min: 0, max: 360, unit: '°', what: 'SARJ position' },
}

const ANGLE_PUIS = [
  'S4000007', 'S4000008', 'S6000008', 'S6000007',
  'P4000007', 'P4000008', 'P6000008', 'P6000007',
]
for (const pui of ANGLE_PUIS) {
  RANGES[pui] = { min: 0, max: 360, unit: '°', what: 'BGA position' }
}

// --- Stream capture ----------------------------------------------------------------------

async function post(url, fields) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })
}

async function capture(items, seconds) {
  const response = await post(`${BASE}/create_session.txt?${PROTOCOL}`, {
    LS_adapter_set: 'ISSLIVE',
    LS_cid: CID,
    LS_send_sync: 'false',
  })
  if (!response.ok || !response.body) throw new Error(`session refused: HTTP ${response.status}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const deadline = Date.now() + seconds * 1000
  const values = new Map()
  let buffer = ''
  let sessionId = null
  let updates = 0

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
        await post(`${BASE}/control.txt?${PROTOCOL}&LS_session=${sessionId}`, {
          LS_reqId: '1',
          LS_op: 'add',
          LS_subId: '1',
          LS_mode: 'MERGE',
          LS_group: items.join(' '),
          LS_schema: SCHEMA.join(' '),
          LS_snapshot: 'true',
        })
        continue
      }
      if (line.startsWith('CONERR,')) throw new Error(`connection refused: ${line}`)

      if (line.startsWith('U,')) {
        updates += 1
        const [, , itemIndex, ...rest] = line.split(',')
        const fields = rest.join(',').split('|')
        const pui = items[Number(itemIndex) - 1]
        // TLCP sends an empty field when a value is unchanged since the last update.
        const previous = values.get(pui)
        const raw = fields[1] === '' || fields[1] === undefined ? previous?.raw : fields[1]
        // Distinct values seen, to tell a live channel from one frozen at a constant.
        const distinct = previous?.distinct ?? new Set()
        if (raw !== undefined) distinct.add(raw)
        values.set(pui, {
          raw,
          distinct,
          updates: (previous?.updates ?? 0) + 1,
          timestamp: fields[0] || previous?.timestamp,
          statusClass: fields[2],
        })
      }
    }
  }
  await reader.cancel().catch(() => {})
  return { values, updates }
}

// --- Reporting ---------------------------------------------------------------------------

let failures = 0
let warnings = 0

function fail(label, detail) {
  failures += 1
  console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`)
}
function warn(label, detail) {
  warnings += 1
  console.log(`  [warn] ${label}${detail ? ` — ${detail}` : ''}`)
}
function ok(label, detail) {
  console.log(`  [ok  ] ${label}${detail ? ` — ${detail}` : ''}`)
}

const num = (values, pui) => {
  const raw = values.get(pui)?.raw
  if (raw === undefined || raw === '') return null
  const parsed = Number.parseFloat(raw)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Age of a reading in days, from the station's own TimeStamp.
 *
 * The field is in hours elapsed since the start of the year, the same origin as TIME_000001
 * (hour 24 = 1 January 00:00). Without this, a value re-sent every second looks fresh no matter
 * when it was actually measured — and several channels re-send readings weeks old.
 */
function ageDays(values, pui) {
  const stamp = Number.parseFloat(values.get(pui)?.timestamp ?? '')
  const nowMs = Number.parseFloat(values.get('TIME_000001')?.raw ?? '')
  if (!Number.isFinite(stamp) || !Number.isFinite(nowMs)) return null
  return nowMs / 86_400_000 - stamp / 24
}

const formatAge = (days) => {
  if (days === null) return 'age unknown'
  if (days < 1 / 1440) return `${(days * 86400).toFixed(0)} s old`
  if (days < 1 / 24) return `${(days * 1440).toFixed(0)} min old`
  if (days < 1) return `${(days * 24).toFixed(1)} h old`
  return `${days.toFixed(1)} days old`
}

async function main() {
  console.log(`\nISS Live — telemetry verification`)
  console.log(`${CHANNELS.length} channels, capturing for ${DURATION_S} s\n`)

  const puis = CHANNELS.map((c) => c.pui)
  const { values, updates } = await capture(puis, DURATION_S)

  console.log(`updates received: ${updates}, symbols with a value: ${values.size} / ${puis.length}`)
  if (values.size === 0) {
    console.error('\nNo data: the stream is not publishing. Nothing can be verified.')
    process.exit(1)
  }

  // ---- 1. Every channel, one by one ----
  console.log('\n=== 1. Channel inventory ===\n')
  const silent = []
  const table = []
  for (const channel of CHANNELS) {
    const symbol = symbolByPui.get(channel.pui)
    const entry = values.get(channel.pui)
    const raw = entry?.raw
    const override = UNIT_OVERRIDES[channel.pui]
    const unit = override?.unit ?? symbol?.units ?? ''

    if (raw === undefined || raw === '') {
      silent.push(channel)
      continue
    }

    // Enumerated symbols decode to a state label.
    let decoded = null
    if (symbol?.values) {
      const key = String(Number.parseFloat(raw))
      decoded = symbol.values[key] ?? symbol.values[raw.trim()] ?? null
    }

    table.push({
      pui: channel.pui,
      label: channel.label,
      value: decoded ?? raw,
      unit: decoded ? '' : unit,
      enumerated: !!symbol?.values,
      undecoded: !!symbol?.values && !decoded,
    })
  }

  for (const row of table) {
    const value = `${row.value}${row.unit ? ' ' + row.unit : ''}`
    console.log(`  ${row.pui.padEnd(14)} ${row.label.padEnd(34)} ${value}`)
  }

  if (silent.length) {
    console.log(`\n  ${silent.length} channel(s) published nothing in ${DURATION_S} s:`)
    for (const c of silent) console.log(`    ${c.pui.padEnd(14)} ${c.label}`)
  }

  const undecoded = table.filter((r) => r.undecoded)
  if (undecoded.length) {
    console.log(`\n  ${undecoded.length} enumerated symbol(s) whose value is not in the catalogue map:`)
    for (const r of undecoded) console.log(`    ${r.pui.padEnd(14)} ${r.label.padEnd(34)} raw=${r.value}`)
  }

  // How old is each reading, according to the station?
  //
  // This supersedes counting distinct values over a short capture, which could not tell a slow
  // channel from a dead one without waiting. The stream's TimeStamp answers directly — and the
  // answer is startling: several channels re-send, every few seconds, a measurement taken weeks
  // ago. Nothing in the arrival rate betrays it.
  console.log('\n--- Age of each reading, per the station ---\n')

  // An old timestamp means two very different things depending on the symbol.
  //
  // For an enumerated symbol it marks the last *transition*: a computer that has read
  // "Not-Off Ok" for 28 days is stable, and that is good news, not a fault. For a continuous
  // measurement it marks the last time the sensor produced a number at all — a partial pressure
  // that has not moved in 25 days is a sensor that stopped reporting.
  // The clock has to have arrived, or every age below is null and every check over them passes on
  // an empty list. That is exactly how this section spent its life reporting no stalled sensors.
  if (!Number.isFinite(Number.parseFloat(values.get(CLOCK)?.raw ?? ''))) {
    fail(`${CLOCK} published no value — no age can be computed, and nothing below is an answer`)
  }

  const analogue = []
  const discrete = []
  const never = []
  for (const channel of CHANNELS) {
    const days = ageDays(values, channel.pui)
    if (days === null) continue
    const stamp = Number.parseFloat(values.get(channel.pui)?.timestamp ?? '')
    // A timestamp of zero is not an old reading, it is no reading: the channel has never
    // carried one. All eight drive currents sit here, which is what "not working" looks like.
    if (!Number.isFinite(stamp) || stamp <= 0) {
      never.push(channel)
      continue
    }
    // The same two sources the application reads: enumerated in the catalogue, or declared as
    // holding its value. Split any other way and this report and the page disagree about which
    // sensors have stopped — they did, by six, until `holds` existed.
    const holds = !!symbolByPui.get(channel.pui)?.values || channel.holds
    ;(holds ? discrete : analogue).push({ ...channel, days })
  }
  analogue.sort((a, b) => b.days - a.days)
  discrete.sort((a, b) => b.days - a.days)

  if (never.length) {
    console.log(`  ${never.length} channel(s) carry no timestamp at all — never measured:`)
    for (const c of never) console.log(`    ${c.pui.padEnd(14)} ${c.label}`)
    console.log('')
  }

  const staleAnalogue = analogue.filter((a) => a.days > 1)
  if (staleAnalogue.length === 0) {
    ok('every continuous measurement is less than a day old')
  } else {
    console.log(`  ${staleAnalogue.length} continuous measurement(s) over a day old — these are stalled sensors:`)
    for (const s of staleAnalogue) {
      console.log(`    ${s.pui.padEnd(14)} ${s.label.padEnd(34)} ${formatAge(s.days)}`)
    }
    console.log('\n  They arrive continuously but were measured long ago. Comparing one of these')
    console.log('  against a live channel compares two moments, not two sensors.')
  }

  const steady = discrete.filter((d) => d.days > 1)
  console.log(`\n  ${steady.length} enumerated symbol(s) unchanged for over a day (stability, not staleness).`)
  if (steady.length) {
    const oldest = steady[0]
    console.log(`  Longest steady: ${oldest.label} — ${formatAge(oldest.days)}`)
  }

  const freshAnalogue = analogue.filter((a) => a.days <= 1)
  if (freshAnalogue.length) {
    console.log(`  ${freshAnalogue.length} continuous measurement(s) under a day old, oldest ${formatAge(freshAnalogue[0].days)}`)
  }

  // ---- 2. Documented ranges ----
  console.log('\n=== 2. Values against documented ranges ===\n')
  for (const [pui, range] of Object.entries(RANGES)) {
    const value = num(values, pui)
    const label = CHANNELS.find((c) => c.pui === pui)?.label ?? pui
    if (value === null) {
      warn(`${label}`, 'no value published')
      continue
    }
    const inside = value >= range.min && value <= range.max
    const detail = `${value} ${range.unit} (expected ${range.min}–${range.max}: ${range.what})`
    if (inside) ok(label, detail)
    else warn(label, detail)
  }

  // ---- 3. Internal consistency ----
  console.log('\n=== 3. Internal consistency ===\n')

  // The partial pressures of a module ought to sum to its total pressure — but only if the four
  // readings describe the same moment. They do not: the partial pressure sensors publish values
  // timestamped weeks in the past while the total pressure is current. The sum is still reported,
  // because it stays close and that is worth knowing, but it cannot be claimed as a check.
  const ppo2 = num(values, 'USLAB000053')
  const ppn2 = num(values, 'USLAB000054')
  const ppco2 = num(values, 'USLAB000055')
  const cabin = num(values, 'USLAB000058')
  if (ppo2 !== null && ppn2 !== null && ppco2 !== null && cabin !== null) {
    const sum = ppo2 + ppn2 + ppco2
    const gap = Math.abs(sum - cabin)
    const ages = ['USLAB000053', 'USLAB000054', 'USLAB000055', 'USLAB000058'].map((p) => ageDays(values, p))
    const spread = Math.max(...ages) - Math.min(...ages)

    console.log(`  [info] Destiny partial pressures sum to ${sum.toFixed(1)} vs cabin ${cabin.toFixed(1)} mmHg (gap ${gap.toFixed(1)})`)
    console.log(`         ppO2 ${formatAge(ages[0])}, ppN2 ${formatAge(ages[1])}, ppCO2 ${formatAge(ages[2])}, total ${formatAge(ages[3])}`)
    if (spread > 1) {
      console.log(`         readings span ${spread.toFixed(1)} days — not contemporaneous, so the sum proves nothing`)
    } else if (gap >= 25) {
      fail('Contemporaneous partial pressures do not sum to cabin pressure', `gap ${gap.toFixed(1)} mmHg`)
    }
  } else {
    warn('Destiny pressure sum', 'one of the four values is missing')
  }

  // Both modules share one atmosphere, so their partial pressures should agree — again, only
  // for readings taken at the same time. The 17.7 mmHg ppO2 disagreement that looked like a
  // genuine difference between modules is two measurements eight days apart.
  const pairs = [
    ['ppO2', 'USLAB000053', 'NODE3000001', 8],
    ['ppN2', 'USLAB000054', 'NODE3000002', 20],
    ['ppCO2', 'USLAB000055', 'NODE3000003', 1.5],
  ]
  for (const [name, a, b, tolerance] of pairs) {
    const va = num(values, a)
    const vb = num(values, b)
    if (va === null || vb === null) {
      warn(`${name} Destiny vs Tranquility`, 'a value is missing')
      continue
    }
    const ageA = ageDays(values, a)
    const ageB = ageDays(values, b)
    const apart = ageA !== null && ageB !== null ? Math.abs(ageA - ageB) : null
    const gap = Math.abs(va - vb)
    const detail = `Destiny ${va.toFixed(2)} (${formatAge(ageA)}), Tranquility ${vb.toFixed(2)} (${formatAge(ageB)}), gap ${gap.toFixed(2)}`

    if (apart !== null && apart > 1) {
      console.log(`  [info] ${name}: readings ${apart.toFixed(1)} days apart, not comparable — ${detail}`)
    } else if (gap <= tolerance) {
      ok(`${name} agrees between the two modules`, detail)
    } else {
      warn(`${name} differs between the two modules`, detail)
    }
  }

  // Momentum saturation must match the momentum and capacity it is derived from.
  const momentum = num(values, 'USLAB000009')
  const capacity = num(values, 'USLAB000038')
  const saturation = num(values, 'USLAB000010')
  if (momentum !== null && capacity !== null && saturation !== null && capacity !== 0) {
    const computed = (Math.abs(momentum) / capacity) * 100
    const gap = Math.abs(computed - saturation)
    const detail = `|${momentum}| / ${capacity} = ${computed.toFixed(1)} % vs published ${saturation} %`
    if (gap < 5) ok('CMG saturation matches momentum / capacity', detail)
    else warn('CMG saturation does not match momentum / capacity', detail)
  } else {
    warn('CMG saturation', 'momentum, capacity or saturation missing')
  }

  // The published count of online CMGs must match the four individual flags.
  const online = num(values, 'USLAB000005')
  const flags = ['USLAB000001', 'USLAB000002', 'USLAB000003', 'USLAB000004'].map((p) => num(values, p))
  if (online !== null && flags.every((f) => f !== null)) {
    const sum = flags.reduce((a, b) => a + b, 0)
    const detail = `flags sum to ${sum}, published count ${online}`
    if (sum === online) ok('CMG count matches the individual flags', detail)
    else warn('CMG count does not match the individual flags', detail)
  }

  // A wheel that is online must be spinning.
  for (let i = 0; i < 4; i++) {
    const flag = flags[i]
    const speed = num(values, ['Z1000009', 'Z1000010', 'Z1000011', 'Z1000012'][i])
    if (flag === null || speed === null) continue
    const spinning = speed > 6000
    if (flag === 1 && spinning) ok(`CMG-${i + 1} online and spinning`, `${speed} rpm`)
    else if (flag === 0 && !spinning) ok(`CMG-${i + 1} offline and stopped`, `${speed} rpm`)
    else warn(`CMG-${i + 1} flag and wheel speed disagree`, `online=${flag}, ${speed} rpm`)
  }

  // The LVLH quaternion must be a unit quaternion. This tests four sensors at once and needs
  // no external reference at all.
  const q = ['USLAB000018', 'USLAB000019', 'USLAB000020', 'USLAB000021'].map((p) => num(values, p))
  if (q.every((v) => v !== null)) {
    const norm = Math.hypot(...q)
    const detail = `|q| = ${norm.toFixed(6)} (q = ${q.map((v) => v.toFixed(4)).join(', ')})`
    if (Math.abs(norm - 1) < 0.01) ok('LVLH quaternion is normalised', detail)
    else fail('LVLH quaternion is not normalised', detail)
  } else {
    warn('LVLH quaternion', 'one of the four components is missing')
  }

  // Onboard GMT against the clock on this machine.
  // Onboard GMT is published in milliseconds elapsed since the start of the year, not as a
  // day-of-year fraction: 18126959000 ms / 86400000 = day 209.80, which is what it means.
  const gmt = values.get('TIME_000001')?.raw
  const year = values.get('TIME_000002')?.raw
  if (gmt) {
    const onboardDay = Number.parseFloat(gmt) / 86400000
    const now = new Date()
    const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1)
    const localDay = (now.getTime() - startOfYear) / 86400000 + 1
    const gapSeconds = Math.abs(onboardDay - localDay) * 86400
    const detail = `onboard day ${onboardDay.toFixed(5)}, this machine ${localDay.toFixed(5)} (gap ${gapSeconds.toFixed(1)} s), year ${year ?? '?'}`
    if (gapSeconds < 120) ok('Onboard GMT agrees with local UTC', detail)
    else warn('Onboard GMT differs from local UTC', detail)

    if (year && Number.parseFloat(year) !== now.getUTCFullYear()) {
      warn('Onboard year differs from this machine', `onboard ${year}, local ${now.getUTCFullYear()}`)
    }
  }

  // ---- 4. External agreement: state vector vs Celestrak + SGP4 ----
  console.log('\n=== 4. State vector against Celestrak + SGP4 ===\n')

  const rx = num(values, 'USLAB000032')
  const ry = num(values, 'USLAB000033')
  const rz = num(values, 'USLAB000034')
  const vx = num(values, 'USLAB000035')
  const vy = num(values, 'USLAB000036')
  const vz = num(values, 'USLAB000037')

  if ([rx, ry, rz, vx, vy, vz].some((v) => v === null)) {
    warn('State vector', 'the station is not publishing a complete state vector')
  } else {
    const rNorm = Math.hypot(rx, ry, rz) // km, per the catalogue description
    const vNorm = Math.hypot(vx, vy, vz) // m/s, per the catalogue description
    console.log(`  published |r| = ${rNorm.toFixed(1)} km, |v| = ${vNorm.toFixed(1)} m/s`)

    const satellite = await import('satellite.js')
    const response = await fetch(
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json',
    )
    const [gp] = await response.json()
    const satrec = satellite.json2satrec(gp)
    const now = new Date()
    const { position, velocity } = satellite.propagate(satrec, now)

    const sgp4R = Math.hypot(position.x, position.y, position.z) // km
    const sgp4V = Math.hypot(velocity.x, velocity.y, velocity.z) * 1000 // km/s -> m/s
    console.log(`  SGP4      |r| = ${sgp4R.toFixed(1)} km, |v| = ${sgp4V.toFixed(1)} m/s`)
    console.log(`  elements from ${gp.EPOCH}\n`)

    const rGap = Math.abs(rNorm - sgp4R)
    const vGap = Math.abs(vNorm - sgp4V)

    // The orbit is slightly eccentric, so |r| swings a few km over one revolution and the two
    // sources are not sampled at the same instant.
    if (rGap < 15) ok('Orbital radius agrees with SGP4', `gap ${rGap.toFixed(2)} km`)
    else fail('Orbital radius disagrees with SGP4', `gap ${rGap.toFixed(2)} km`)

    if (vGap < 30) ok('Orbital speed agrees with SGP4', `gap ${vGap.toFixed(2)} m/s`)
    else fail('Orbital speed disagrees with SGP4', `gap ${vGap.toFixed(2)} m/s`)

    // Vis-viva: the speed must match the radius for this orbit, independently of both sources.
    const MU = 398600.4418 // km^3/s^2
    const a = satrec.a * 6378.137 // semi-major axis in km
    const visViva = Math.sqrt(MU * (2 / rNorm - 1 / a)) * 1000
    const visGap = Math.abs(vNorm - visViva)
    const detail = `vis-viva predicts ${visViva.toFixed(1)} m/s at r=${rNorm.toFixed(1)} km (gap ${visGap.toFixed(1)} m/s)`
    if (visGap < 30) ok('Published speed and radius satisfy vis-viva', detail)
    else fail('Published speed and radius contradict vis-viva', detail)

    // Beta angle: the station publishes it, the application computes it. Reusing the
    // application's own function is the point — this checks the code that ships, not a
    // second implementation written to agree with it.
    const state = propagateIss(satrec, now)
    const beta = num(values, 'USLAB000040')
    if (beta !== null && state) {
      const computed = betaAngle(state, now)
      const gap = Math.abs(computed - beta)
      const d = `published ${beta.toFixed(2)}°, computed ${computed.toFixed(2)}° (gap ${gap.toFixed(2)}°)`
      if (gap < 1.5) ok('Solar beta angle agrees with the application', d)
      else fail('Solar beta angle disagrees with the application', d)
    }

    // Eclipse: this is what explains the power channels. In shadow the arrays deliver
    // nothing and the bus runs off the batteries, below its 160 V sunlit value.
    if (state) {
      const inShadow = state.shadow >= 0.5
      console.log(
        `\n  eclipse state: shadow fraction ${state.shadow.toFixed(2)} — station is ${inShadow ? 'in Earth shadow' : 'in sunlight'}`,
      )

      const currents = ['S4000002', 'S4000005', 'S6000005', 'S6000002', 'P4000002', 'P4000005', 'P6000005', 'P6000002']
        .map((p) => num(values, p))
        .filter((v) => v !== null)
      const voltages = ['S4000001', 'S4000004', 'S6000004', 'S6000001', 'P4000001', 'P4000004', 'P6000004', 'P6000001']
        .map((p) => num(values, p))
        .filter((v) => v !== null)

      if (currents.length === 8 && voltages.length === 8) {
        const allZero = currents.every((c) => c === 0)

        // Do NOT test the currents against the lighting state. They read zero in eclipse and
        // zero in sunlight alike, because the channel is not published at all — NASA's own
        // Mimic guide marks this readout "not working". Calling a zero "consistent with
        // eclipse" would be a passing check that confirms nothing, which is worse than no
        // check: it reports agreement between a real measurement and a constant.
        if (allZero) {
          console.log('  array drive currents: all eight at zero (channel not published)')
        } else {
          warn('A drive current is non-zero', `${currents.filter((c) => c !== 0).length}/8 — the channel was thought to be dead, so this is worth a look`)
        }

        // The drive voltages ARE live, and their spread is the one readable thing left in the
        // power section. In eclipse they have always been converged near 151.2 V. In sunlight
        // they have been seen both converged and split into groups ~9 V apart, so sunlight
        // permits the split without causing it — no assertion is made for the sunlit case.
        const sorted = [...voltages].sort((a, b) => a - b)
        const spread = sorted[sorted.length - 1] - sorted[0]
        console.log(`  drive voltages: ${sorted.map((v) => v.toFixed(1)).join(', ')} V  (spread ${spread.toFixed(1)} V)`)

        if (inShadow && spread < 1) {
          ok('Drive voltages converge in eclipse', `${spread.toFixed(2)} V apart — consistent with every channel on battery power`)
        } else if (inShadow) {
          warn('Drive voltages stay split in eclipse', `${spread.toFixed(1)} V apart`)
        } else if (spread > 3) {
          console.log('  split into groups while sunlit — what selects the high group is not yet known')
        }
      }
    }

    // Mass, against the published state.
    const mass = num(values, 'USLAB000039')
    if (mass !== null) console.log(`\n  station mass: ${(mass / 1000).toFixed(1)} t`)
  }

  // ---- Summary ----
  console.log('\n=== Summary ===\n')
  console.log(`  channels with data : ${table.length} / ${CHANNELS.length}`)
  console.log(`  silent channels    : ${silent.length}`)
  console.log(`  undecoded enums    : ${undecoded.length}`)
  console.log(`  failures           : ${failures}`)
  console.log(`  warnings           : ${warnings}`)

  if (failures > 0) {
    console.log('\nContradictions found. These are not judgement calls: the values disagree with')
    console.log('each other or with an independent source.')
    process.exit(1)
  }
  console.log('\nNo contradiction found.')
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
