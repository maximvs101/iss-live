/**
 * When to re-establish the stream, rather than wait and hope.
 *
 * Reported from use: once the telemetry stopped, it never came back green while the tab stayed
 * open. Reloading the page fixed it every time — which is the tell. A reload does exactly one
 * thing the running page did not: it opens a new session and asks for the snapshot again.
 *
 * The connection was left entirely to the SDK, which retries a dropped transport but cannot help
 * with the two cases that actually strand a long-lived tab:
 *
 *   - the client ends in a state it will not retry from — a server error, a refused subscription —
 *     and nothing in the application ever calls `connect` a second time;
 *   - the transport is up and the subscription is silently no longer delivering, which from the
 *     outside is indistinguishable from an upstream that has stopped publishing.
 *
 * Neither can be told apart from a healthy tab by looking at the connection alone, so the policy
 * below reads the connection *and* the age of the data, and it is deliberately conservative about
 * the second case: reconnecting cannot conjure telemetry that NASA is not broadcasting, and a page
 * that reconnects every ten seconds through a four-day outage is a page hammering a public server
 * for nothing.
 *
 * A pure function so the interesting cases can be tested without a network: the ones that matter
 * are a laptop coming back from sleep and an outage lasting days, and neither is reachable by hand.
 */
import type { ConnectionState } from './store'

/** Past this, data is no longer live — the same figure the status bar uses. */
export const LIVE_THRESHOLD_MS = 60_000

/**
 * How long a *connected* stream may stay silent before the subscription is suspected.
 *
 * Loss of signal between relay satellites runs to several minutes and is entirely normal, so this
 * has to sit well past it or every pass would trigger a needless reconnection. Fifteen minutes is
 * the same boundary the status bar calls an outage rather than an interruption.
 */
export const SILENT_LIMIT_MS = 15 * 60_000

/** First backoff step after a failed connection, doubling to the cap. */
export const BACKOFF_START_MS = 5_000
export const BACKOFF_CAP_MS = 60_000

export interface ReconnectInput {
  connection: ConnectionState
  /** Age of the newest sample, or null if nothing has ever arrived. */
  ageMs: number | null
  /** Time since the last time we re-established, or null if we never have. */
  sinceAttemptMs: number | null
  /** Consecutive attempts that have not yet produced data. */
  attempts: number
  /** The browser's own view of connectivity. Nothing to reconnect to without it. */
  online: boolean
  /** Whether the tab is being looked at. */
  visible: boolean
  /** Set once when the tab is shown again, or the machine comes back online. */
  woke: boolean
}

export interface ReconnectDecision {
  reconnect: boolean
  reason: string | null
}

export function reconnectDecision(input: ReconnectInput): ReconnectDecision {
  const { connection, ageMs, sinceAttemptMs, attempts, online, visible, woke } = input

  if (!online) return { reconnect: false, reason: null }
  if (connection === 'idle') return { reconnect: false, reason: null }

  /*
   * Nothing happens behind a hidden tab. Fresh telemetry is of no use to a page nobody is looking
   * at, and a public server does not need a hundred background tabs re-establishing sessions
   * through an outage. Bringing the tab forward sets `woke`, which reconnects at once.
   */
  if (!visible) return { reconnect: false, reason: null }

  const live = ageMs !== null && ageMs <= LIVE_THRESHOLD_MS
  if (live) return { reconnect: false, reason: null }

  const backoff = Math.min(BACKOFF_CAP_MS, BACKOFF_START_MS * 2 ** attempts)
  const waited = sinceAttemptMs === null || sinceAttemptMs >= backoff

  /*
   * Coming back from sleep is the common case and deserves to skip the queue: the machine was shut
   * for an hour, the socket died with it, and the person is looking at the screen right now. One
   * attempt, immediately, rather than making them watch a backoff they did not earn.
   */
  if (woke) return { reconnect: true, reason: 'the tab came back' }

  // A connection the SDK has given up on. Nothing else will ever restart it.
  if (connection === 'disconnected') {
    return waited
      ? { reconnect: true, reason: 'the connection dropped' }
      : { reconnect: false, reason: null }
  }

  /*
   * Connected, and silent for longer than a loss of signal explains. This is the ambiguous case —
   * a dead subscription and a dead broadcast look identical from here — so it is tried once and
   * then left alone for another quarter of an hour. If the broadcast really is down the page keeps
   * saying so, which is the honest answer, and it says it without a reconnection loop behind it.
   */
  if (connection === 'connected' && ageMs !== null && ageMs > SILENT_LIMIT_MS) {
    return sinceAttemptMs === null || sinceAttemptMs >= SILENT_LIMIT_MS
      ? { reconnect: true, reason: 'connected but silent for a quarter of an hour' }
      : { reconnect: false, reason: null }
  }

  return { reconnect: false, reason: null }
}
