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
  [CLOCK]: 'station clock',
}

const ITEMS = Object.keys(WATCH)

/**
 * How long to listen. Ten seconds, down from twenty-five.
 *
 * Waiting on a socket costs no CPU — Cloudflare bills only the parsing — so the length of this
 * window is not free after all: it sets how much there is to parse. Against a live stream at
 * roughly 1,400 updates a minute, ten seconds still brings in some two hundred of them, which is
 * two orders of magnitude more than the twenty-seven needed to call the broadcast alive.
 *
 * What it cost at twenty-five: four thousand eight hundred and forty-four invocations out of six
 * thousand killed at exactly ten milliseconds of CPU, and eighty per cent of the record missing.
 */
const LISTEN_MS = 10_000

/**
 * Stop once the answer is in, rather than listening to the end regardless.
 *
 * The listening window bounds the work only if the stream's rate is known, and it is not: a quiet
 * minute delivers twenty-seven updates and a busy one fourteen hundred, a fiftyfold spread on the
 * one budget that gets this invocation killed. Counting to a fixed number instead makes the cost
 * of a busy minute equal to the cost of a moderate one.
 *
 * Four hundred pushes is far past the point of diminishing returns. Twenty-seven would prove the
 * broadcast alive; the rest exists only to catch a value changing mid-window, and the values that
 * matter here — eight array voltages — move on the scale of minutes, not milliseconds.
 */
const MAX_PUSHES = 400

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

  try {
    while (!enough && Date.now() < until) {
      /*
       * Raced against the deadline, because the loop condition alone does not enforce it.
       *
       * `await reader.read()` only returns when the server sends something. A socket that stays
       * open and silent never wakes it, the condition above is never re-evaluated, and the
       * invocation runs to Cloudflare's fifteen-minute ceiling. It has not happened yet — the
       * longest recorded listen is 32.4 s — but nothing in the code prevents it.
       */
      const chunk = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), until - Date.now())),
      ])
      if (chunk.timedOut || chunk.done) break

      buffer += decoder.decode(chunk.value, { stream: true })

      /*
       * Scanned with indexOf rather than split, and read with slice rather than destructuring.
       *
       * This loop is the whole CPU budget. The free plan allows ten milliseconds per invocation and
       * four thousand eight hundred of them were killed at exactly that figure; a minute carrying no
       * data at all already spent half of it. The previous version allocated three arrays for every
       * update line — `split(',')`, then `join(',')`, then `split('|')` — and one more per read for
       * the lines themselves. None of those allocations survive here.
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
          const stamp = bar === -1 || bar > end ? '' : buffer.slice(c3 + 1, bar)
          const value = bar === -1 || bar > end ? buffer.slice(c3 + 1, end) : buffer.slice(bar + 1, end)

          const previous = seen.get(pui)
          if (previous) pushes += 1
          seen.set(pui, {
            stamp: stamp || previous?.stamp || '',
            value: value || previous?.value || '',
            updates: (previous?.updates ?? 0) + 1,
          })
          if (pushes >= MAX_PUSHES) {
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
          })
          continue
        }

        if (kind === 67 && buffer.startsWith('CONERR,', from)) throw new Error(buffer.slice(from, from + 80))
      }
      buffer = start === 0 ? buffer : buffer.slice(start)
      if (enough) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  if (!session) throw new Error('no session')
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
  const current = {}
  let moved = 0
  for (const [pui, entry] of seen) {
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
        ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)',
    ).bind(
      at,
      'ok',
      pushes,
      seen.size,
      moved,
      (Date.now() - started) / 1000,
      anyChange ? JSON.stringify(changed) : null,
      anyChange ? JSON.stringify(stamps) : null,
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
