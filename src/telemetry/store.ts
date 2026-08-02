/**
 * State of the telemetry received from the ISS Live stream.
 *
 * The stream can emit more than a hundred updates per second: the client accumulates them and
 * flushes them here in batches (see client.ts), so that React does not re-render once per sample.
 */
import { create } from 'zustand'

/** Connection states to the Lightstreamer server, as reported by the SDK. */
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'stalled' | 'disconnected'

export interface TelemetrySample {
  pui: string
  /** Value published by NASA, in engineering units (already calibrated). */
  value: string | null
  calibrated: string | null
  /** Onboard timestamp, as transmitted by the station. */
  timestamp: string | null
  statusClass: string | null
  statusIndicator: string | null
  statusColor: string | null
  /** Local time of receipt. */
  receivedAt: number
  /**
   * When the *station* says the reading was taken, parsed from `timestamp`. Null when it carries
   * nothing usable, which eight of the 163 symbols do.
   *
   * This, and not `receivedAt`, is what freshness has to be measured from. The two normally agree
   * to a few seconds — measured live, the newest onboard reading was 3 s old against 1 s since it
   * arrived — and they part company in exactly the case that matters: re-subscribing re-delivers
   * the last known values, which arrive *now* and were taken whenever they were taken. Measuring
   * from arrival would let a reconnection turn the light green over a station that has sent
   * nothing, which is the one thing this application is not allowed to do.
   */
  onboardAt: number | null
}

interface TelemetryStore {
  samples: Record<string, TelemetrySample>
  connection: ConnectionState
  /** SDK detail ("CONNECTED:WS-STREAMING"…), useful in engineering mode. */
  connectionDetail: string | null
  /** Number of symbols actually subscribed, as confirmed by the server. */
  subscribedCount: number
  /** Most recent receipt, across all symbols. null until something arrives. */
  lastUpdateAt: number | null
  /**
   * Newest reading the *station* has taken, across all symbols.
   *
   * The newest rather than the average, because the symbols run at wildly different rates: the
   * joint angles are seconds old while the partial-pressure sensors publish readings weeks back.
   * The freshest of them is what says whether the station is talking.
   */
  newestOnboardAt: number | null
  /** Running count of updates since the page was opened. */
  updateCount: number

  applyBatch: (samples: TelemetrySample[]) => void
  setConnection: (state: ConnectionState, detail?: string | null) => void
  setSubscribedCount: (count: number) => void
  reset: () => void
}

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  samples: {},
  connection: 'idle',
  connectionDetail: null,
  subscribedCount: 0,
  lastUpdateAt: null,
  newestOnboardAt: null,
  updateCount: 0,

  applyBatch: (batch) =>
    set((state) => {
      if (batch.length === 0) return state
      const samples = { ...state.samples }
      let newest = state.lastUpdateAt ?? 0
      let onboard = state.newestOnboardAt ?? 0
      for (const sample of batch) {
        samples[sample.pui] = sample
        if (sample.receivedAt > newest) newest = sample.receivedAt
        if (sample.onboardAt !== null && sample.onboardAt > onboard) onboard = sample.onboardAt
      }
      return {
        samples,
        lastUpdateAt: newest,
        newestOnboardAt: onboard === 0 ? null : onboard,
        updateCount: state.updateCount + batch.length,
      }
    }),

  setConnection: (connection, connectionDetail = null) => set({ connection, connectionDetail }),
  setSubscribedCount: (subscribedCount) => set({ subscribedCount }),
  reset: () =>
    set({
      samples: {},
      connection: 'idle',
      connectionDetail: null,
      subscribedCount: 0,
      lastUpdateAt: null,
      newestOnboardAt: null,
      updateCount: 0,
    }),
}))

/** Selector for one symbol: re-renders only when that sample changes. */
export function useSample(pui: string): TelemetrySample | undefined {
  return useTelemetryStore((state) => state.samples[pui])
}

/** Numeric value of a symbol, or null if absent or non-numeric. */
export function readNumber(pui: string): number | null {
  const raw = useTelemetryStore.getState().samples[pui]?.value
  if (raw === null || raw === undefined || raw === '') return null
  const numeric = Number.parseFloat(raw)
  return Number.isNaN(numeric) ? null : numeric
}
