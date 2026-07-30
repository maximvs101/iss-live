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
  /** Local time of receipt, the basis for every freshness calculation. */
  receivedAt: number
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
  updateCount: 0,

  applyBatch: (batch) =>
    set((state) => {
      if (batch.length === 0) return state
      const samples = { ...state.samples }
      let newest = state.lastUpdateAt ?? 0
      for (const sample of batch) {
        samples[sample.pui] = sample
        if (sample.receivedAt > newest) newest = sample.receivedAt
      }
      return {
        samples,
        lastUpdateAt: newest,
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
      updateCount: 0,
    }),
}))

/** Selector for one symbol: re-renders only when that sample changes. */
export function useSample(pui: string): TelemetrySample | undefined {
  return useTelemetryStore((state) => state.samples[pui])
}

/** Read outside React, for the 3D animation loop, which must not trigger renders. */
export function readSample(pui: string): TelemetrySample | undefined {
  return useTelemetryStore.getState().samples[pui]
}

/** Numeric value of a symbol, or null if absent or non-numeric. */
export function readNumber(pui: string): number | null {
  const raw = useTelemetryStore.getState().samples[pui]?.value
  if (raw === null || raw === undefined || raw === '') return null
  const numeric = Number.parseFloat(raw)
  return Number.isNaN(numeric) ? null : numeric
}
