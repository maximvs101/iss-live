/**
 * The time, for components that print an age.
 *
 * A row that says "2 min 0 s old" has to keep saying something truer as the minutes pass, and the
 * only thing that used to re-render a telemetry row was a new sample — so during a broadcast
 * outage, when no sample comes, every age on the page froze at whatever it last read, and a row
 * drawn at age zero showed no age at all. One clock, one interval shared by every subscriber, and
 * the interval only runs while somebody is listening.
 *
 * Five seconds, not one: an age is only printed past a minute, where the display moves in whole
 * seconds nobody counts, and 163 rows on a one-second tick would be the busiest thing on the page.
 */
import { useSyncExternalStore } from 'react'

const TICK_MS = 5_000

let nowMs = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!timer) {
    timer = setInterval(() => {
      nowMs = Date.now()
      for (const notify of listeners) notify()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/*
 * Read before the first subscription, `nowMs` is whatever the module last saw — minutes ago if the
 * page sat with no row mounted. Refreshed here when it has fallen a tick behind, which keeps the
 * value stable across the repeated reads one render makes, as `useSyncExternalStore` requires.
 * In either direction: a clock the system has just set back is as far off as one that ran on.
 */
function snapshot(): number {
  if (Math.abs(Date.now() - nowMs) >= TICK_MS) nowMs = Date.now()
  return nowMs
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
