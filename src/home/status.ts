/**
 * Whether NASA is broadcasting, for one line on the home page.
 *
 * Read from the collector's /status rather than by opening a Lightstreamer session, which is the
 * weight of the whole console. Any failure — no address yet, no answer in four seconds, an answer
 * of the wrong shape — gives null, and the page leaves the line out rather than guessing.
 */
export interface BroadcastStatus {
  live: boolean
  lastLive: string | null
}

/** The collector's public address, set once the Worker with /status is deployed. Until then: no line. */
export const STATUS_URL: string | null = null

export async function fetchStatus(
  url: string | null = STATUS_URL,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<BroadcastStatus | null> {
  if (!url) return null
  try {
    const answer = fetcher(url).then(async (response) => (response.ok ? response.json() : null))
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    const body = (await Promise.race([answer, timeout])) as Record<string, unknown> | null
    if (!body || typeof body.live !== 'boolean') return null
    const lastLive = typeof body.lastLive === 'string' ? body.lastLive : null
    return { live: body.live, lastLive }
  } catch {
    return null
  }
}

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function statusLine(status: BroadcastStatus): string {
  if (status.live) return 'live telemetry from the station'
  if (!status.lastLive) return 'NASA’s broadcast is silent'
  return `NASA’s broadcast silent since ${day.format(new Date(status.lastLive))}`
}
