/**
 * Stream health, as it must be announced to the user.
 *
 * Two distinct things are at play and the interface must never conflate them:
 *  - the connection to the Lightstreamer server, which may be perfectly established;
 *  - the actual arrival of data from the station, which can stop for minutes (loss of signal
 *    between relay satellites) or for days (an outage of the public broadcast upstream).
 *
 * Detection is based on the age of the last update received. The `Status.Class` field of
 * TIME_000001 is also used by other projects to signal acquisition of signal, but its exact
 * semantics could not be confirmed against real data: it is exposed without being relied upon.
 */
import { useEffect, useState } from 'react'
import { useTelemetryStore } from './store'

export type StreamHealth =
  /** No connection requested. */
  | 'idle'
  /** Connection being established or recovered. */
  | 'connecting'
  /** Server reached and subscription accepted, but the station has sent nothing yet. */
  | 'waiting'
  /** Fresh data. */
  | 'live'
  /** Recently interrupted: typically a loss of signal lasting a few minutes. */
  | 'stale'
  /** Prolonged interruption, beyond an ordinary loss of signal. */
  | 'outage'
  /** Server unreachable. */
  | 'offline'

/** Past this delay without an update, the stream is no longer considered real time. */
export const LIVE_THRESHOLD_MS = 60_000
/** Past this delay, the interruption exceeds an ordinary loss of signal. */
export const STALE_THRESHOLD_MS = 15 * 60_000

export interface StreamStatus {
  health: StreamHealth
  /** Age of the most recent data, in milliseconds. null if nothing ever arrived. */
  ageMs: number | null
  detail: string | null
  subscribedCount: number
  updateCount: number
}

export function computeStreamStatus(now: number): StreamStatus {
  const { connection, connectionDetail, lastUpdateAt, subscribedCount, updateCount } =
    useTelemetryStore.getState()

  const ageMs = lastUpdateAt === null ? null : now - lastUpdateAt
  const base = { ageMs, detail: connectionDetail, subscribedCount, updateCount }

  if (connection === 'idle') return { ...base, health: 'idle' }
  if (connection === 'disconnected') return { ...base, health: 'offline' }
  if (connection === 'connecting' || connection === 'stalled') {
    return { ...base, health: 'connecting' }
  }

  // Connected to the server: the age of the data decides.
  if (ageMs === null) return { ...base, health: 'waiting' }
  if (ageMs <= LIVE_THRESHOLD_MS) return { ...base, health: 'live' }
  if (ageMs <= STALE_THRESHOLD_MS) return { ...base, health: 'stale' }
  return { ...base, health: 'outage' }
}

/** Stream status, re-evaluated every second even when no data arrives. */
export function useStreamStatus(): StreamStatus {
  const [status, setStatus] = useState(() => computeStreamStatus(Date.now()))

  useEffect(() => {
    const tick = () => setStatus(computeStreamStatus(Date.now()))
    const timer = setInterval(tick, 1000)
    const unsubscribe = useTelemetryStore.subscribe(tick)
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [])

  return status
}

export const HEALTH_LABELS: Record<StreamHealth, string> = {
  idle: 'Waiting to connect',
  connecting: 'Connecting to server',
  waiting: 'Connected — no data broadcast',
  live: 'Live telemetry',
  stale: 'Signal interrupted',
  outage: 'Broadcast interrupted',
  offline: 'Server unreachable',
}

/**
 * Age of a measurement according to the station, not according to us.
 *
 * This distinction matters more than it looks. The stream re-sends a value whenever it wants,
 * so a sample can arrive seconds ago and carry a reading taken weeks earlier — the partial
 * pressure sensors do exactly that, publishing values timestamped 25 and 33 days back. Measuring
 * from local arrival time made the interface announce "3 min" for month-old data, which is the
 * one thing this application is not allowed to do.
 *
 * The stream's `TimeStamp` field is expressed in **hours elapsed since the start of the year**,
 * on the same origin as `TIME_000001`: hour 24 is 1 January 00:00 UTC. Checked against the
 * onboard clock, 5036.2715 h maps to day 209.8446, which is what the clock reported.
 */
export function onboardTimestampToDate(timestamp: string, now = new Date()): Date | null {
  const hours = Number.parseFloat(timestamp)
  if (!Number.isFinite(hours) || hours <= 0) return null

  const atYear = (year: number) => new Date(Date.UTC(year, 0, 1) + (hours - 24) * 3_600_000)

  const thisYear = atYear(now.getUTCFullYear())
  // A timestamp reading ahead of the current time belongs to the previous year: the field
  // carries no year of its own, and the stream keeps running across 1 January.
  if (thisYear.getTime() > now.getTime() + 86_400_000) return atYear(now.getUTCFullYear() - 1)
  return thisYear
}

/** Formats a duration, to state how old the data is. */
export function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  const days = Math.floor(hours / 24)
  return `${days} d ${hours % 24} h`
}
