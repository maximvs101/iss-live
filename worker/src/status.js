/**
 * Is NASA broadcasting? Answered from what the collector already records every minute.
 *
 * For the home page, which cannot afford a Lightstreamer session to find out. Two reads of one row
 * each: the last minute the station pushed anything — through the partial index in schema.sql, so
 * a two-week silence does not mean scanning twenty thousand rows — and the last minute the
 * collector ran at all.
 */
const LIVE_WITHIN_MS = 10 * 60_000

export const STATUS_HEADERS = {
  'access-control-allow-origin': 'https://iss-live.pages.dev',
  'cache-control': 'public, max-age=60',
}

export async function status(env, now = Date.now()) {
  const live = await env.DB.prepare('SELECT at FROM liveness WHERE pushes > 0 ORDER BY at DESC LIMIT 1').first()
  const last = await env.DB.prepare('SELECT at FROM liveness ORDER BY at DESC LIMIT 1').first()
  const lastLive = live?.at ?? null
  const checkedAt = last?.at ?? null
  // Only the collector's own recent run can say anything. If it has stopped — or never ran — the
  // broadcast's state is unknown, and `live: null` makes the home page leave the line out rather
  // than pass the collector's silence off as NASA's.
  const collecting = checkedAt !== null && now - Date.parse(checkedAt) <= LIVE_WITHIN_MS
  return {
    live: collecting ? lastLive !== null && now - Date.parse(lastLive) <= LIVE_WITHIN_MS : null,
    lastLive,
    checkedAt,
  }
}
