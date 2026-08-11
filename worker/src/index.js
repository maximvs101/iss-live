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
 * How long to listen.
 *
 * Cron invocations may run for fifteen minutes of wall time, but the free plan allows ten
 * milliseconds of *CPU* — and waiting on a socket costs none of it. Twenty-five seconds is long
 * enough that a symbol publishing at 1 Hz sends many updates and a silent stream is unmistakable,
 * while the parsing stays a few thousand small string operations.
 */
const LISTEN_MS = 25_000

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

  try {
    while (Date.now() < until) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\r\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line || line.charCodeAt(0) === 78) continue // NOOP

        if (!session && line.startsWith('CONOK,')) {
          session = line.split(',')[1]
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

        if (line.startsWith('CONERR,')) throw new Error(line.slice(0, 80))
        if (!line.startsWith('U,')) continue

        const [, , index, ...rest] = line.split(',')
        const parts = rest.join(',').split('|')
        const pui = ITEMS[Number(index) - 1]
        if (!pui) continue
        const previous = seen.get(pui)
        seen.set(pui, {
          stamp: parts[0] || previous?.stamp || '',
          value: parts[1] || previous?.value || '',
          updates: (previous?.updates ?? 0) + 1,
        })
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  if (!session) throw new Error('no session')
  return seen
}

/** One invocation: listen, compare against what was last stored, write. */
async function collect(env) {
  const at = new Date().toISOString()
  const started = Date.now()

  let seen
  try {
    seen = await listen()
  } catch (error) {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO liveness (at, state, pushes, symbols, moved, seconds, detail) VALUES (?, ?, 0, 0, 0, ?, ?)',
    )
      .bind(at, 'error', (Date.now() - started) / 1000, String(error).slice(0, 200))
      .run()
    return
  }

  // One update per symbol is the snapshot. Everything beyond it is the station speaking.
  let updates = 0
  for (const entry of seen.values()) updates += entry.updates
  const pushes = updates - seen.size

  const previous = new Map(
    (await env.DB.prepare('SELECT pui, value FROM latest').all()).results.map((r) => [r.pui, r.value]),
  )

  const writes = []
  let moved = 0
  for (const [pui, entry] of seen) {
    if (previous.get(pui) === entry.value) continue
    if (previous.has(pui)) moved += 1
    writes.push(
      env.DB.prepare('INSERT OR REPLACE INTO readings (at, pui, what, value, stamp) VALUES (?, ?, ?, ?, ?)')
        .bind(at, pui, WATCH[pui], entry.value, entry.stamp || null),
      env.DB.prepare('INSERT OR REPLACE INTO latest (pui, value, stamp, at) VALUES (?, ?, ?, ?)')
        .bind(pui, entry.value, entry.stamp || null, at),
    )
  }

  writes.push(
    env.DB.prepare(
      'INSERT OR REPLACE INTO liveness (at, state, pushes, symbols, moved, seconds, detail) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    ).bind(at, 'ok', pushes, seen.size, moved, (Date.now() - started) / 1000),
  )

  await env.DB.batch(writes)
}

/** The weekly review, as a URL rather than a command to remember. */
async function report(env) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const live = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM liveness WHERE at >= ? AND state = ? AND pushes > 0',
  ).bind(since, 'ok').first()
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM liveness WHERE at >= ?').bind(since).first()

  const voltChanges = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM readings WHERE at >= ? AND what LIKE '% volts'",
  ).bind(since).first()

  const sensors = await env.DB.prepare(
    `SELECT what, COUNT(*) AS changes, MAX(at) AS last
     FROM readings WHERE at >= ? AND (what LIKE '%pp%' OR what IN ('o2 production','station mass'))
     GROUP BY what`,
  ).bind(since).all()

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
        : voltChanges?.n
          ? `${voltChanges.n} changes recorded — query readings for the spread`
          : 'not one of the eight moved in all the live time recorded',
    stalledSensors: sensors.results,
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
