/**
 * Tests for the reconnection policy.
 *
 * The two cases worth having are the two nobody can produce by hand: a machine coming back from
 * sleep after the socket died with it, and a broadcast that has been down for four days. The first
 * has to recover immediately; the second must not turn into a page hammering a public server for
 * telemetry that is not being sent.
 */
import { describe, expect, it } from 'vitest'
import {
  BACKOFF_CAP_MS,
  BACKOFF_START_MS,
  LIVE_THRESHOLD_MS,
  SILENT_LIMIT_MS,
  reconnectDecision,
} from './reconnect'

const base = {
  connection: 'connected' as const,
  ageMs: 2_000,
  sinceAttemptMs: null,
  attempts: 0,
  online: true,
  visible: true,
  woke: false,
}

describe('the reconnection policy', () => {
  it('leaves a healthy stream alone', () => {
    expect(reconnectDecision(base).reconnect).toBe(false)
    expect(reconnectDecision({ ...base, ageMs: LIVE_THRESHOLD_MS - 1 }).reconnect).toBe(false)
  })

  it('restarts a connection the SDK has given up on', () => {
    // The gap this exists to close: nothing else in the application ever calls connect twice.
    const decision = reconnectDecision({ ...base, connection: 'disconnected', ageMs: 90_000 })
    expect(decision.reconnect).toBe(true)
    expect(decision.reason).toMatch(/dropped/)
  })

  it('backs off, and stops backing off at a minute', () => {
    const dropped = { ...base, connection: 'disconnected' as const, ageMs: 90_000 }
    // Just tried: wait.
    expect(reconnectDecision({ ...dropped, attempts: 1, sinceAttemptMs: 1_000 }).reconnect).toBe(false)
    // Waited the doubled step: go.
    expect(reconnectDecision({ ...dropped, attempts: 1, sinceAttemptMs: 2 * BACKOFF_START_MS }).reconnect).toBe(true)
    // And the step never grows past the cap, however long it has been failing.
    expect(reconnectDecision({ ...dropped, attempts: 20, sinceAttemptMs: BACKOFF_CAP_MS }).reconnect).toBe(true)
    expect(reconnectDecision({ ...dropped, attempts: 20, sinceAttemptMs: BACKOFF_CAP_MS - 1 }).reconnect).toBe(false)
  })

  it('comes straight back when the tab does', () => {
    // A laptop shut for an hour: the socket died with it and the person is looking at the screen
    // now. No backoff, whatever the attempt count says.
    const decision = reconnectDecision({
      ...base,
      connection: 'disconnected',
      ageMs: 3_600_000,
      attempts: 9,
      sinceAttemptMs: 500,
      woke: true,
    })
    expect(decision.reconnect).toBe(true)
    expect(decision.reason).toMatch(/came back/)
  })

  it('does nothing at all behind a hidden tab', () => {
    // Not an optimisation but a courtesy: a page nobody is looking at has no use for fresh
    // telemetry, and a public server has no use for a hundred background tabs reopening sessions.
    for (const connection of ['connected', 'disconnected', 'stalled'] as const) {
      expect(
        reconnectDecision({ ...base, connection, ageMs: 3_600_000, visible: false }).reconnect,
        connection,
      ).toBe(false)
    }
    // Including the shortcut, which only exists for a tab that has just been looked at.
    expect(reconnectDecision({ ...base, ageMs: 3_600_000, woke: true, visible: false }).reconnect).toBe(false)
  })

  it('tries once when a live connection has gone quiet, then leaves it', () => {
    const silent = { ...base, ageMs: SILENT_LIMIT_MS + 1_000 }
    expect(reconnectDecision(silent).reconnect).toBe(true)
    expect(reconnectDecision({ ...silent, sinceAttemptMs: 60_000 }).reconnect).toBe(false)
    expect(reconnectDecision({ ...silent, sinceAttemptMs: SILENT_LIMIT_MS }).reconnect).toBe(true)
  })

  it('sits through an ordinary loss of signal without touching anything', () => {
    // Several minutes of silence between relay satellites is normal, and reconnecting through it
    // would be a reconnection every pass for no reason at all.
    for (const minutes of [2, 5, 10, 14]) {
      expect(reconnectDecision({ ...base, ageMs: minutes * 60_000 }).reconnect, `${minutes} min`).toBe(false)
    }
  })

  it('does not thrash through a broadcast outage lasting days', () => {
    // The state this application was written in: four days of silence from a healthy server. Over
    // a day, the policy is allowed one attempt per quarter of an hour and no more.
    let attempts = 0
    let sinceAttemptMs: number | null = null
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const decision = reconnectDecision({
        ...base,
        ageMs: (4 * 24 * 60 + minute) * 60_000,
        sinceAttemptMs,
        attempts,
      })
      if (decision.reconnect) {
        attempts += 1
        sinceAttemptMs = 0
      } else if (sinceAttemptMs !== null) {
        sinceAttemptMs += 60_000
      }
    }
    // Four an hour is the ceiling the quarter-hour rule sets; the loop lands a little under it
    // because the wait restarts from the attempt rather than from the previous deadline.
    expect(attempts).toBeLessThanOrEqual(24 * 4)
    expect(attempts).toBeGreaterThan(24 * 3)
  })

  it('does nothing at all with no network', () => {
    expect(reconnectDecision({ ...base, connection: 'disconnected', ageMs: 1e6, online: false }).reconnect).toBe(false)
    expect(reconnectDecision({ ...base, ageMs: 1e6, online: false, woke: true }).reconnect).toBe(false)
  })

  it('stays out of the way before anything has been asked for', () => {
    expect(reconnectDecision({ ...base, connection: 'idle', ageMs: null }).reconnect).toBe(false)
  })
})
