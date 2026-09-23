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
  return {
    live: lastLive !== null && now - Date.parse(lastLive) <= LIVE_WITHIN_MS,
    lastLive,
    checkedAt: last?.at ?? null,
  }
}
