/**
 * Connection to NASA's public ISS Live stream, broadcast by Lightstreamer.
 *
 * Contract verified against the public server on 28/07/2026:
 *   server       https://push.lightstreamer.com
 *   adapter set  ISSLIVE
 *   mode         MERGE
 *   items        the <Public_PUI> identifiers from the catalogue (e.g. "USLAB000058")
 *   schema       TimeStamp, Value, Status.Class, Status.Indicator, Status.Color, CalibratedData
 *
 * The SDK handles reconnection and transport selection (WebSocket, falling back to HTTP).
 */
import { LightstreamerClient, Subscription } from 'lightstreamer-client-web'
import { appendHistory } from '../history/indexeddb'
import { useTelemetryStore, type ConnectionState, type TelemetrySample } from './store'

export const LS_SERVER = 'https://push.lightstreamer.com'
export const LS_ADAPTER_SET = 'ISSLIVE'

export const LS_SCHEMA = [
  'TimeStamp',
  'Value',
  'Status.Class',
  'Status.Indicator',
  'Status.Color',
  'CalibratedData',
] as const

/** How often the buffer is flushed into the store, in milliseconds. */
const FLUSH_INTERVAL_MS = 250
/**
 * How often samples are archived into local history: far slower than the display.
 *
 * Exported because the charts read from that history, and a chart that re-reads faster than this
 * writes is re-reading the same points. It was doing exactly that — up to four times a second for
 * one new point every five.
 */
export const HISTORY_INTERVAL_MS = 5000

let client: LightstreamerClient | null = null
let subscription: Subscription | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null
let lastHistoryWrite = 0

/** Buffer of the latest value per symbol, emptied on every flush. */
const pending = new Map<string, TelemetrySample>()

function mapConnectionStatus(status: string): ConnectionState {
  if (status.startsWith('CONNECTED:')) return 'connected'
  if (status.startsWith('STALLED')) return 'stalled'
  if (status.startsWith('CONNECTING')) return 'connecting'
  if (status.startsWith('DISCONNECTED:WILL-RETRY')) return 'connecting'
  if (status.startsWith('DISCONNECTED:TRYING-RECOVERY')) return 'connecting'
  return 'disconnected'
}

function flush() {
  if (pending.size === 0) return
  const batch = [...pending.values()]
  pending.clear()
  useTelemetryStore.getState().applyBatch(batch)

  // Sparse archiving: only numeric quantities are kept, since enumerated states mean nothing
  // on a plot.
  const now = Date.now()
  if (now - lastHistoryWrite < HISTORY_INTERVAL_MS) return
  lastHistoryWrite = now

  const points = batch
    .map((sample) => ({
      pui: sample.pui,
      t: sample.receivedAt,
      value: Number.parseFloat(sample.value ?? ''),
    }))
    .filter((point) => Number.isFinite(point.value))

  void appendHistory(points).catch((error) => {
    console.warn('[telemetry] local history unavailable:', error)
  })
}

export interface ConnectOptions {
  /** Symbols to subscribe to. They must exist in the catalogue. */
  items: string[]
  /** Cap on updates per second per symbol. "unlimited" to apply no filtering. */
  maxFrequency?: number | 'unlimited'
}

/**
 * Opens the connection and subscribes to the requested symbols.
 * Call `disconnectTelemetry()` to release the resources.
 */
export function connectTelemetry({ items, maxFrequency = 1 }: ConnectOptions): void {
  if (client) disconnectTelemetry()
  if (items.length === 0) return

  const store = useTelemetryStore.getState()
  client = new LightstreamerClient(LS_SERVER, LS_ADAPTER_SET)

  client.addListener({
    onStatusChange(status: string) {
      useTelemetryStore.getState().setConnection(mapConnectionStatus(status), status)
    },
    onServerError(code: number, message: string) {
      useTelemetryStore.getState().setConnection('disconnected', `Server error ${code}: ${message}`)
    },
  })

  subscription = new Subscription('MERGE', items, [...LS_SCHEMA])
  subscription.setRequestedSnapshot('yes')
  // The SDK's published types only declare a number, although the method also accepts the
  // "unlimited" keyword documented in that same signature.
  subscription.setRequestedMaxFrequency(maxFrequency as number)

  subscription.addListener({
    onSubscription() {
      useTelemetryStore.getState().setSubscribedCount(items.length)
    },
    onUnsubscription() {
      useTelemetryStore.getState().setSubscribedCount(0)
    },
    onSubscriptionError(code: number, message: string) {
      useTelemetryStore
        .getState()
        .setConnection('disconnected', `Subscription refused ${code}: ${message}`)
    },
    onItemUpdate(update: {
      getItemName(): string | null
      getValue(field: string): string | null
    }) {
      const pui = update.getItemName()
      if (!pui) return
      pending.set(pui, {
        pui,
        value: update.getValue('Value'),
        calibrated: update.getValue('CalibratedData'),
        timestamp: update.getValue('TimeStamp'),
        statusClass: update.getValue('Status.Class'),
        statusIndicator: update.getValue('Status.Indicator'),
        statusColor: update.getValue('Status.Color'),
        receivedAt: Date.now(),
      })
    },
  })

  client.subscribe(subscription)
  client.connect()
  store.setConnection('connecting', 'CONNECTING')

  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)
}

export function disconnectTelemetry(): void {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  pending.clear()
  if (client) {
    if (subscription) client.unsubscribe(subscription)
    client.disconnect()
  }
  client = null
  subscription = null
  useTelemetryStore.getState().setConnection('idle', null)
  useTelemetryStore.getState().setSubscribedCount(0)
}
