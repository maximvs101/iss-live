/**
 * Records the stream continuously, and knows the difference between quiet and dead.
 *
 * Everything that went wrong today came from sampling: a capture every five minutes cannot tell a
 * frozen value from an unchanged one, and a fresh subscription always hands back a snapshot that
 * looks like data. A run of nineteen captures across a whole orbit reported "no split anywhere" when
 * what it had actually recorded was ninety-eight minutes of the same eight numbers, bit for bit,
 * because the broadcast was down the entire time.
 *
 * One long-lived session removes the ambiguity rather than working around it. The first update a
 * symbol sends after a session opens is its snapshot — the server's memory. Every update after that
 * arrived because the station said something. Nothing has to be inferred from timestamps, which is
 * just as well: they are quoted against `TIME_000001`, which freezes with everything else, so a
 * dead snapshot reads as perfectly fresh against its own clock.
 *
 * Two logs, both append-only so a kill at any moment loses at most the line being written.
 *
 *   collect-liveness.jsonl   one line a minute: pushes seen, symbols moved, session state.
 *                            This is the record of when the broadcast was actually up.
 *   collect-events.jsonl     one line per *change* of a watched value — except for the handful
 *                            that change without stopping, which are sampled on the heartbeat
 *                            instead. See SAMPLED. Silence is the signal here: a channel that
 *                            never appears never moved.
 *
 * Restartable and safe to run twice — both files are appends, and the report sorts by time.
 */
import { appendFileSync, mkdirSync } from 'node:fs'

const BASE = 'https://push.lightstreamer.com/lightstreamer'
const TLCP = 'LS_protocol=TLCP-2.5.0'
const CID = 'mgQkwtwdysogQz2BJ4Ji kOj2rm'

/** The station's own clock, in milliseconds into the year. Watched like any other symbol. */
const CLOCK = 'TIME_000001'

/**
 * What to watch, and why.
 *
 * Deliberately not all 163. At 1 Hz a week of everything is tens of millions of records for two
 * questions. These are the symbols those questions are about, plus enough context to interpret them.
 */
const WATCH = {
  // The eight array drive voltages: the split.
  S4000001: '1A volts', S4000004: '3A volts', S6000004: '1B volts', S6000001: '3B volts',
  P4000001: '2A volts', P4000004: '4A volts', P6000004: '2B volts', P6000001: '4B volts',
  // Their gimbals and the two rotary joints: where each wing is pointing when it happens.
  S4000007: '1A bga', S4000008: '3A bga', S6000008: '1B bga', S6000007: '3B bga',
  P4000007: '2A bga', P4000008: '4A bga', P6000008: '2B bga', P6000007: '4B bga',
  S0000003: 'sarj stbd', S0000004: 'sarj port',
  // The sensors that were re-sending readings weeks old: do they ever resume.
  USLAB000053: 'destiny ppO2', USLAB000055: 'destiny ppCO2',
  NODE3000001: 'tranquility ppO2', NODE3000003: 'tranquility ppCO2',
  NODE3000011: 'o2 production', USLAB000039: 'station mass',
  USLAB000058: 'cabin pressure',
  // On-board beta, to compare against the propagated one.
  USLAB000040: 'beta measured',
  [CLOCK]: 'station clock',
}

const ITEMS = Object.keys(WATCH)

/**
 * Three symbols do nearly all the talking, and writing down everything they say buries the rest.
 *
 * Measured over the first six minutes of the September run — 10 503 lines:
 *
 *     9 083  (86 %)  the station clock, which ticks
 *       607  ( 6 %)  the two rotary joints, which turn
 *       591  ( 6 %)  the eight gimbals, which track
 *       222  ( 2 %)  the eight voltages and the measured beta — the questions
 *
 * At that rate a fortnight is 4.2 GB, four fifths of it a clock. The clock's whole duty here is to
 * prove the broadcast is alive, and `pushes` on the liveness line already does that once a minute;
 * its value now rides there too, so the timebase is kept and the log is not. The joints and the
 * gimbals are context — where each wing pointed when the voltages parted — and no question asked
 * of them is finer than a minute, so they are sampled on the heartbeat: a line only where the
 * value moved between two beats.
 *
 * Nothing the report reads is thinned. It asks about the eight voltages and about the six stalled
 * sensors, and those still write on every change, which is the point of the whole exercise.
 */
const SAMPLED = new Set(
  ITEMS.filter((pui) => WATCH[pui].endsWith(' bga') || WATCH[pui].startsWith('sarj ')),
)
const LOGGED = new Set(ITEMS.filter((pui) => pui !== CLOCK && !SAMPLED.has(pui)))

const DIR = new URL('../data/', import.meta.url)
const LIVENESS = new URL('collect-liveness.jsonl', DIR)
const EVENTS = new URL('collect-events.jsonl', DIR)

/** How often the liveness line is written. A minute is fine grained against a week. */
const HEARTBEAT_MS = 60_000
/** Backoff between reconnection attempts, doubling to this cap. */
const RETRY_START_MS = 5_000
const RETRY_CAP_MS = 120_000

mkdirSync(DIR, { recursive: true })

const write = (file, row) => appendFileSync(file, `${JSON.stringify(row)}\n`)

/** Last value seen per symbol, across sessions, so a reconnection does not re-log everything. */
const lastValue = new Map()

let pushes = 0
let moved = new Set()
let sessionState = 'starting'
let sessionOpenedAt = null
let sessions = 0

/** Last value written for each sampled symbol, so a beat that saw no movement writes nothing. */
const lastSampled = new Map()

setInterval(() => {
  const at = new Date().toISOString()
  write(LIVENESS, {
    at,
    state: sessionState,
    pushes,
    moved: [...moved],
    sessions,
    upSeconds: sessionOpenedAt ? Math.round((Date.now() - sessionOpenedAt) / 1000) : 0,
    // The station's own clock, once a minute: everything the clock was worth in the event log,
    // at a nine-thousandth of the lines.
    clock: lastValue.get(CLOCK)?.value ?? null,
  })

  for (const pui of SAMPLED) {
    const current = lastValue.get(pui)
    if (!current || current.value === lastSampled.get(pui)) continue
    lastSampled.set(pui, current.value)
    write(EVENTS, {
      at,
      pui,
      what: WATCH[pui],
      value: current.value,
      timestamp: current.timestamp,
      sampled: true,
    })
  }

  pushes = 0
  moved = new Set()
}, HEARTBEAT_MS).unref?.()

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })

async function runSession() {
  const res = await post(`${BASE}/create_session.txt?${TLCP}`, {
    LS_adapter_set: 'ISSLIVE',
    LS_cid: CID,
    LS_send_sync: 'false',
  })
  if (!res.ok || !res.body) throw new Error(`create_session ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let session = null

  /*
   * The first update per symbol in *this* session is its snapshot, not news.
   *
   * This set is what makes the whole file trustworthy. Without it a reconnection every few minutes
   * would look like a healthy stream, which is precisely the illusion that wasted an orbit today.
   */
  const snapshotDone = new Set()

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\r\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line || line === 'PROBE' || line.startsWith('NOOP')) continue

      if (line.startsWith('CONOK,') && !session) {
        session = line.split(',')[1]
        sessions += 1
        sessionOpenedAt = Date.now()
        sessionState = 'subscribing'
        await post(`${BASE}/control.txt?${TLCP}&LS_session=${session}`, {
          LS_reqId: '1',
          LS_op: 'add',
          LS_subId: '1',
          LS_mode: 'MERGE',
          LS_group: ITEMS.join(' '),
          LS_schema: 'TimeStamp Value',
          LS_snapshot: 'true',
        })
        continue
      }

      if (line.startsWith('CONERR,') || line.startsWith('END')) throw new Error(line)
      if (line.startsWith('SUBOK,')) {
        sessionState = 'subscribed'
        continue
      }

      if (!line.startsWith('U,')) continue

      const [, , index, ...rest] = line.split(',')
      const parts = rest.join(',').split('|')
      const pui = ITEMS[Number(index) - 1]
      if (!pui) continue

      const previous = lastValue.get(pui)
      const value = parts[1] || previous?.value || ''
      const timestamp = parts[0] || previous?.timestamp || ''

      const isSnapshot = !snapshotDone.has(pui)
      snapshotDone.add(pui)
      if (!isSnapshot) pushes += 1

      // Only a change is worth a line, and only from a symbol whose every change is worth one. A
      // value that never moves leaves no trace, which is exactly what its absence from this file
      // should mean — and the sampled symbols leave theirs on the heartbeat instead.
      const changed = !previous || previous.value !== value
      if (changed && previous) moved.add(WATCH[pui])
      if (changed && LOGGED.has(pui)) {
        write(EVENTS, {
          at: new Date().toISOString(),
          pui,
          what: WATCH[pui],
          value,
          timestamp,
          snapshot: isSnapshot,
        })
      }
      lastValue.set(pui, { value, timestamp })
    }
  }
}

console.log(`Collecting ${ITEMS.length} symbols. Liveness every ${HEARTBEAT_MS / 1000} s.`)
console.log(`  ${LIVENESS.pathname.split('/').pop()}  when the broadcast was up`)
console.log(`  ${EVENTS.pathname.split('/').pop()}  every change of a watched value`)
console.log('Ctrl-C to stop; both files are appends, so it can be restarted at any time.\n')

let backoff = RETRY_START_MS
for (;;) {
  try {
    sessionState = 'connecting'
    await runSession()
    // A clean end of stream is still an end: reconnect.
    sessionState = 'ended'
  } catch (error) {
    sessionState = 'error'
    write(LIVENESS, { at: new Date().toISOString(), state: 'error', error: String(error).slice(0, 120) })
  }
  await new Promise((r) => setTimeout(r, backoff))
  backoff = Math.min(RETRY_CAP_MS, backoff * 2)
  // A session that lasted a while means the connection is fine; start the ladder over.
  if (sessionOpenedAt && Date.now() - sessionOpenedAt > 5 * 60_000) backoff = RETRY_START_MS
}
