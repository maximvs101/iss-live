/**
 * Collects the ISS telemetry stream from Cloudflare's edge, so nothing depends on a machine at home
 * being switched on.
 *
 * Woken once a minute by a cron trigger. Each invocation opens its own TLCP session, listens, and
 * writes what it learned to D1. It answers one question the site cannot: over a week, when was the
 * broadcast actually up, and did the array voltages ever part?
 *
 * The distinction it is built around, learned the hard way. Subscribing always yields a snapshot —
 * the server's memory of every symbol, returned whatever the state of the broadcast. Counting those
 * as data makes a dead stream look busy, and it does so convincingly: the per-symbol timestamps are
 * quoted against `TIME_000001`, which freezes with everything else, so a snapshot from six hours ago
 * reads as perfectly fresh against its own clock. The only sound test is arithmetic — one update per
 * symbol is memory, a second is the station speaking.
 *
 * This runs as its own Worker, deliberately apart from the Pages project. The site stays a static
 * artefact with no server behind it; this is a sibling in the same account.
 */

const BASE = 'https://push.lightstreamer.com/lightstreamer'
const TLCP = 'LS_protocol=TLCP-2.5.0'
const CID = 'mgQkwtwdysogQz2BJ4Ji kOj2rm'

/** The station's own clock, in milliseconds into the year. */
const CLOCK = 'TIME_000001'

/**
 * What to watch, and why. Not all 163 — these are the symbols the open questions are about.
 *
 * The eight drive voltages are the split. Their gimbals and the two rotary joints say where each
 * wing was pointing when it happened. The rest are the sensors that were re-sending readings weeks
 * old, plus cabin pressure to compare them against and the on-board beta to check the propagated one.
 */
const WATCH = {
  S4000001: '1A volts', S4000004: '3A volts', S6000004: '1B volts', S6000001: '3B volts',
  P4000001: '2A volts', P4000004: '4A volts', P6000004: '2B volts', P6000001: '4B volts',
  S4000007: '1A bga', S4000008: '3A bga', S6000008: '1B bga', S6000007: '3B bga',
  P4000007: '2A bga', P4000008: '4A bga', P6000008: '2B bga', P6000007: '4B bga',
  S0000003: 'sarj stbd', S0000004: 'sarj port',
  USLAB000053: 'destiny ppO2', USLAB000055: 'destiny ppCO2',
  NODE3000001: 'tranquility ppO2', NODE3000003: 'tranquility ppCO2',
  NODE3000011: 'o2 production', USLAB000039: 'station mass',
  USLAB000058: 'cabin pressure', USLAB000040: 'beta measured',
  /*
   * The station's own position and velocity, added 30/08/2026 for a reason worth writing down.
   *
   * The array-pointing analysis needs the Sun's direction in the station's own frame, and until
   * now it built that frame by propagating a Celestrak element set to the moment of each reading.
   * Beta survives that perfectly — propagated and published agree to 0.04° nineteen days out — but
   * the frame does not: it turns with the station's position along the orbit, and along-track error
   * is exactly what a stale element set accumulates.
   *
   * Measured, and it is not subtle. The residual that no gimbal angle can remove, which should be
   * a couple of degrees whenever the arrays are tracking, ran 2.3° on the day of the element set's
   * epoch and 34.2° nineteen days before it, decreasing monotonically in between. None of that is
   * the station; all of it is the propagation. The analysis was quietly getting worse at reading
   * its own oldest data, every day.
   *
   * With these six the frame comes from the station and the Sun from the date, and nothing has to
   * be propagated at all.
   */
  USLAB000032: 'j2000 x', USLAB000033: 'j2000 y', USLAB000034: 'j2000 z',
  USLAB000035: 'j2000 vx', USLAB000036: 'j2000 vy', USLAB000037: 'j2000 vz',
  /*
   * The five states that say whether a reading may be interpreted at all, added 30/08/2026.
   *
   * Every conclusion about where the arrays point rests on premises nobody wrote down until they
   * were violated: that the station is flying its nominal attitude, that it is not manoeuvring,
   * that no spacewalk or docking has the arrays somewhere deliberate, and that the rotary joints
   * are tracking rather than parked. Twice now those premises have failed silently and been caught
   * only by arithmetic — a starboard joint sitting at exactly 124.8° for hours, discovered because
   * one bin out of nine disagreed and reversed the verdict of an entire comparison.
   *
   * The station publishes all of it and it was never being recorded. These are enumerated, so they
   * change perhaps twice a week: they cost a snapshot update each and nothing after.
   */
  S0000008: 'sarj port mode', S0000009: 'sarj stbd mode',
  USLAB000017: 'attitude frame', USLAB000081: 'manoeuvre in progress',
  USLAB000086: 'station mode',
  [CLOCK]: 'station clock',
}

/**
 * Readings where zero is physically impossible, so a zero is the broadcast, not the station.
 *
 * The same eight the application refuses at the door — see `Channel.neverZero` in
 * src/telemetry/subsystems.ts — of which this collector watches six. Recorded twice, on
 * 11 August at 16:44 UTC and 19 August at 00:31, when twenty-two symbols read exactly 0 for one
 * minute and came back the minute after.
 */
const NEVER_ZERO = new Set([
  'USLAB000053',
  'USLAB000054',
  'USLAB000055',
  'NODE3000001',
  'NODE3000002',
  'NODE3000003',
  'USLAB000058',
  'USLAB000039',
])

const ITEMS = Object.keys(WATCH)

/**
 * How long to listen. Ten seconds, down from twenty-five.
 *
 * Waiting on a socket costs nothing; what the window really sets is how many times the stream gets
 * read, and reading is what gets billed. With the frequency throttle below, ten seconds is roughly
 * seventeen reads whether the broadcast is busy or quiet, so the window can be chosen for what it
 * observes rather than for what it costs — and observing liveness across ten seconds says more than
 * stopping the moment the count is reached.
 */
const LISTEN_MS = 10_000

/**
 * Ask the server to send less, rather than draining everything it offers.
 *
 * What costs CPU here is the number of times the stream has to be read, not the parsing: a
 * synthetic bench puts the parse loop at 0.3 µs a line, 0.57 ms for three thousand two hundred of
 * them, and it is flat. Against the live stream the same ten seconds cost 219 reads unthrottled
 * and 17 at this setting — the same twenty-seven symbols, the broadcast still visibly alive at
 * twenty-five pushes, for a thirteenth of the reading.
 *
 * One update per item per five seconds. MERGE mode conflates what it withholds, so each update
 * that does arrive carries the current value; nothing is lost that this collector looks at, which
 * samples once a minute anyway. Verified against the real server rather than assumed — it answers
 * `SUBOK,1,27,2` with the parameter present, and a subscription that had silently failed would
 * report zero pushes forever and read exactly like an outage.
 */
const MAX_HZ = 0.2

/**
 * A ceiling on pushes, kept only as a guard now that the throttle does the work.
 *
 * Thirty-eight items at 0.2 Hz over ten seconds cannot exceed seventy-six. Eighty therefore never
 * fires while the server honours the frequency — it exists for the case
 * where it stops honouring it, and bounds that minute to roughly fifty reads instead of the two
 * hundred and nineteen that used to blow the CPU allowance.
 */
const MAX_PUSHES = 90

/**
 * Stop once the minute's work is actually done, rather than listening to the end regardless.
 *
 * What a minute has to produce is one reading of every symbol — the snapshot gives that — and
 * enough updates beyond it to show the station is speaking. Both arrive in the first seconds; the
 * rest of the window is spent reading a stream nobody is going to look at.
 *
 * The reason for caring is margin. With thirty-three symbols the invocation measured 7.5 to 9.3 ms
 * of CPU against a ceiling of 10, and a fortnight of collection is twenty thousand invocations —
 * a tail that never showed in six samples will certainly show in twenty thousand. Overshooting is
 * not a lost minute but an hour: it drains the burst allowance and every invocation after it is
 * killed at exactly 10 ms until the allowance refills, which is how eighty per cent of an earlier
 * run was lost.
 *
 * Fifteen is well past the point of proof. A quiet stream reaches neither condition and listens to
 * the end, which is both correct and cheap — there is nothing arriving to read.
 */
const LIVENESS_PUSHES = 15

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })

/** Opens a session, listens, and reports what each symbol sent. */
async function listen() {
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
  /** pui -> { value, stamp, updates } */
  const seen = new Map()
  const until = Date.now() + LISTEN_MS
  /** Updates beyond the first for a symbol, counted here so the loop can stop on them. */
  let pushes = 0
  let enough = false
  /** Lines carrying a TLCP field-compression marker, which this parser does not decode. */
  let odd = 0
  /** Recorded because this, not the parsing, is what the CPU allowance is actually spent on. */
  let reads = 0

  /*
   * Raced against the deadline, because the loop condition alone does not enforce it.
   *
   * `await reader.read()` only returns when the server sends something. A socket that stays open
   * and silent never wakes it, the condition below is never re-evaluated, and the invocation runs
   * to Cloudflare's fifteen-minute ceiling.
   *
   * One timer for the whole listen, not one per read. The first version built a fresh `setTimeout`
   * inside the loop and never cleared any of them, so a busy minute left two hundred-odd live
   * timers queued to fire at the same instant.
   */
  let fire
  const deadline = new Promise((resolve) => {
    fire = setTimeout(() => resolve({ timedOut: true }), LISTEN_MS)
  })

  try {
    while (!enough && Date.now() < until) {
      const chunk = await Promise.race([reader.read(), deadline])
      if (chunk.timedOut || chunk.done) break
      reads += 1

      buffer += decoder.decode(chunk.value, { stream: true })

      /*
       * Scanned with indexOf rather than split, and read with slice rather than destructuring.
       *
       * Kept for the allocations it avoids, not because it is where the time goes — measured, this
       * loop is flat at 0.3 µs a line and could not account for the kills on its own. The cost that
       * matters is upstream, in how many times the stream has to be read at all.
       */
      let start = 0
      for (;;) {
        const end = buffer.indexOf('\r\n', start)
        if (end === -1) break
        const from = start
        start = end + 2
        if (end === from) continue

        const kind = buffer.charCodeAt(from)
        if (kind === 78) continue // NOOP, the commonest line by far on a quiet stream

        if (kind === 85 && buffer.charCodeAt(from + 1) === 44) {
          // U,<subId>,<itemIndex>,<timestamp>|<value>
          const c2 = buffer.indexOf(',', from + 2)
          if (c2 === -1) continue
          const c3 = buffer.indexOf(',', c2 + 1)
          if (c3 === -1 || c3 > end) continue
          const index = Number(buffer.slice(c2 + 1, c3))
          const pui = ITEMS[index - 1]
          if (!pui) continue

          const bar = buffer.indexOf('|', c3 + 1)
          const split = bar === -1 || bar > end ? -1 : bar

          /*
           * A field section carrying '^' is TLCP saying "the next N fields are unchanged", and
           * neither this parser nor the one before it decodes that. The old one read the marker
           * itself as a timestamp; this one skips the line and counts it.
           *
           * Recording nothing beats recording a marker as though it were a measurement, which is
           * the standing rule here. Nothing in four days of capture has contained one — but every
           * capture examined was of a quiet stream, and field compression is precisely what a busy
           * one would use, so the counter exists to say if that assumption ever breaks.
           */
          if (buffer.charCodeAt(c3 + 1) === 94) {
            odd += 1
            continue
          }

          /*
           * With one field and no separator, that field is the FIRST one — TimeStamp — not the
           * value. The rewrite had this inverted, assigning a lone field to Value; caught by a
           * differential test against the previous parser rather than by reading, and never
           * triggered in production because this server always sends both fields.
           */
          const stamp = split === -1 ? buffer.slice(c3 + 1, end) : buffer.slice(c3 + 1, split)
          const value = split === -1 ? '' : buffer.slice(split + 1, end)

          const previous = seen.get(pui)
          if (previous) pushes += 1
          seen.set(pui, {
            stamp: stamp || previous?.stamp || '',
            value: value || previous?.value || '',
            updates: (previous?.updates ?? 0) + 1,
          })
          // Everything the minute is for: every symbol seen once, and the station demonstrably
          // speaking. Or the guard, if the server ever stops honouring the frequency.
          if ((seen.size >= ITEMS.length && pushes >= LIVENESS_PUSHES) || pushes >= MAX_PUSHES) {
            enough = true
            break
          }
          continue
        }

        if (!session && kind === 67 && buffer.startsWith('CONOK,', from)) {
          const c1 = buffer.indexOf(',', from + 6)
          session = buffer.slice(from + 6, c1 === -1 || c1 > end ? end : c1)
          await post(`${BASE}/control.txt?${TLCP}&LS_session=${session}`, {
            LS_reqId: '1',
            LS_op: 'add',
            LS_subId: '1',
            LS_mode: 'MERGE',
            LS_group: ITEMS.join(' '),
            LS_schema: 'TimeStamp Value',
            LS_snapshot: 'true',
            LS_requested_max_frequency: String(MAX_HZ),
          })
          continue
        }

        if (kind === 67 && buffer.startsWith('CONERR,', from)) throw new Error(buffer.slice(from, from + 80))
      }
      buffer = start === 0 ? buffer : buffer.slice(start)
      if (enough) break
    }
  } finally {
    clearTimeout(fire)
    await reader.cancel().catch(() => {})
  }

  if (!session) throw new Error('no session')
  seen.odd = odd
  seen.reads = reads
  return seen
}

/**
 * One invocation: listen, compare against what was last stored, write.
 *
 * The whole body is guarded, not just the listening. The first version wrapped `listen()` alone,
 * which left the D1 read, the JSON parse, the final batch and the error path's own insert exposed —
 * and since this runs under `ctx.waitUntil`, a throw from any of them became an unhandled rejection
 * that reached Cloudflare's counters and nothing else. Measured over the first four days: fourteen
 * exceptions against a single error row.
 */
async function collect(env) {
  const at = new Date().toISOString()
  const started = Date.now()
  try {
    await gather(env, at, started)
  } catch (error) {
    // Last resort. If this write is what failed, there is nothing further to try.
    try {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO liveness (at, state, pushes, symbols, moved, seconds, changed, stamps, detail)' +
          ' VALUES (?, ?, 0, 0, 0, ?, NULL, NULL, ?)',
      )
        .bind(at, 'error', (Date.now() - started) / 1000, String(error).slice(0, 200))
        .run()
    } catch {
      // Swallowed on purpose: an unhandled rejection here would be the very failure mode this
      // function exists to close, and Cloudflare already counts the invocation as an error.
    }
  }
}

async function gather(env, at, started) {
  const seen = await listen()

  // One update per symbol is the snapshot. Everything beyond it is the station speaking.
  let updates = 0
  for (const entry of seen.values()) updates += entry.updates
  const pushes = updates - seen.size

  /*
   * One read and two writes, whatever happened.
   *
   * A row per changed symbol would be 79,200 writes a day once the broadcast is live, against a
   * free-plan ceiling of 100,000 past which D1 refuses queries until midnight UTC. That failure
   * would arrive mid-week and in silence, at exactly the moment the data started being worth
   * having. The changed values ride as JSON on the liveness row instead.
   */
  const carried = await env.DB.prepare('SELECT held FROM carried WHERE id = 1').first()
  const previous = carried ? JSON.parse(carried.held) : {}

  const changed = {}
  const stamps = {}
  /*
   * What is held starts from what was held, not from nothing.
   *
   * `current` was built only from the symbols that answered this minute, and then written over the
   * carried row — so a minute where the broadcast said nothing wrote an empty object, and the next
   * live minute found no previous value for anything. Every symbol then landed in `changed` with
   * `moved` at zero, and `/report` counted one change for all thirty-eight, on the sensors whose
   * silence is the whole question.
   *
   * Visible in the record on 2 September: 08:39 pushes 0, then 08:40 with `moved 0` and `changed`
   * carrying all 38 symbols. Each outage in the window produced exactly one of those rows, which
   * is why the six stalled sensors each read "3 changes" while none of them had moved.
   *
   * A symbol that did not answer keeps the value it had. That is what the carried row is for.
   */
  const current = { ...previous }
  let moved = 0
  for (const [pui, entry] of seen) {
    // A zero from a channel that cannot read zero is the broadcast dropping out, not the station.
    // Carried through, it is recorded as two changes — down and back — on exactly the sensors this
    // record exists to watch, and `/report` then answers "has it resumed?" with a dropout's
    // timestamp. Skipped entirely: the row keeps the value it held, which is what was true.
    if (NEVER_ZERO.has(pui) && Number.parseFloat(entry.value) === 0) continue
    current[pui] = entry.value
    if (previous[pui] === entry.value) continue
    if (pui in previous) moved += 1
    changed[pui] = entry.value
    if (entry.stamp) stamps[pui] = entry.stamp
  }
  const anyChange = Object.keys(changed).length > 0

  await env.DB.batch([
    env.DB.prepare(
      'INSERT OR REPLACE INTO liveness (at, state, pushes, symbols, moved, seconds, changed, stamps, detail)' +
        ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      at,
      'ok',
      pushes,
      seen.size,
      moved,
      (Date.now() - started) / 1000,
      anyChange ? JSON.stringify(changed) : null,
      anyChange ? JSON.stringify(stamps) : null,
      // Reads are the cost driver, so they are recorded rather than inferred. The skipped count is
      // null on every row so far; if it ever isn't, the parser is dropping lines it cannot read.
      `reads ${seen.reads}${seen.odd ? ` skipped ${seen.odd} compressed` : ''}`,
    ),
    env.DB.prepare('INSERT OR REPLACE INTO carried (id, held, at) VALUES (1, ?, ?)')
      .bind(JSON.stringify(current), at),
  ])
}

/** The weekly review, as a URL rather than a command to remember. */
async function report(env) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const live = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM liveness WHERE at >= ? AND state = ? AND pushes > 0',
  ).bind(since, 'ok').first()
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM liveness WHERE at >= ?').bind(since).first()

  /*
   * The changed values are JSON on the row rather than rows of their own, so counting them is a
   * scan rather than a GROUP BY. At a line a minute that is ten thousand rows a week — nothing.
   */
  const rows = (
    await env.DB.prepare('SELECT at, changed FROM liveness WHERE at >= ? AND changed IS NOT NULL')
      .bind(since).all()
  ).results

  const VOLT_PUIS = Object.entries(WATCH).filter(([, w]) => w.endsWith(' volts')).map(([p]) => p)
  const SENSOR_PUIS = Object.entries(WATCH)
    .filter(([, w]) => w.includes('pp') || w === 'o2 production' || w === 'station mass')
    .map(([p]) => p)

  let voltChanges = 0
  const sensorChanges = Object.fromEntries(SENSOR_PUIS.map((p) => [WATCH[p], { changes: 0, last: null }]))
  for (const row of rows) {
    const changed = JSON.parse(row.changed)
    for (const pui of Object.keys(changed)) {
      if (VOLT_PUIS.includes(pui)) voltChanges += 1
      const entry = sensorChanges[WATCH[pui]]
      if (entry) {
        entry.changes += 1
        entry.last = row.at
      }
    }
  }

  const recent = await env.DB.prepare(
    'SELECT at, state, pushes, symbols, moved FROM liveness ORDER BY at DESC LIMIT 30',
  ).all()

  const liveMinutes = live?.n ?? 0
  const totalMinutes = total?.n ?? 0

  return {
    window: { since, minutesRecorded: totalMinutes, minutesBroadcastUp: liveMinutes },
    uptime: totalMinutes ? Number(((liveMinutes / totalMinutes) * 100).toFixed(1)) : null,
    // Answered against live minutes, never elapsed ones, and not answered at all below an hour of
    // them: a question with no data behind it is unanswered, not answered in the negative.
    voltages:
      liveMinutes < 60
        ? 'too little live data to say'
        : voltChanges
          ? `${voltChanges} voltage changes recorded across ${liveMinutes} live minutes`
          : 'not one of the eight moved in all the live time recorded',
    stalledSensors: sensorChanges,
    recent: recent.results,
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(collect(env))
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/report') {
      return Response.json(await report(env), {
        headers: { 'cache-control': 'public, max-age=60' },
      })
    }
    if (url.pathname === '/collect') {
      // Manual trigger, for checking the thing works without waiting for the minute.
      await collect(env)
      return Response.json({ ok: true })
    }
    return new Response('ISS collector. /report for the weekly review.\n', {
      headers: { 'content-type': 'text/plain' },
    })
  },
}
