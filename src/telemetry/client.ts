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
import { onboardTimestampToDate } from './health'
import { useTelemetryStore, type ConnectionState, type TelemetrySample } from './store'

const LS_SERVER = 'https://push.lightstreamer.com'
const LS_ADAPTER_SET = 'ISSLIVE'

const LS_SCHEMA = [
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

/**
 * The same, for the archive, and it is a second map because the two empty at different rates.
 *
 * The display flushes twenty times for every archive tick, so `pending` at the moment the tick
 * opens holds only whatever arrived in the last 250 ms — everything else was applied to the store
 * and cleared. Archiving from it meant the history received one twentieth of a window rather than
 * a window. Measured on the live stream over 55 s, with all 163 symbols subscribed: **526 points
 * where 1 956 were intended**, 11 to 26 written per tick instead of 163, and the *median symbol
 * held one single point* — the snapshot it arrived with, and nothing for the rest of the minute.
 * The charts read this history.
 */
const archive = new Map<string, TelemetrySample>()

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

  // Carried over to the archive before the buffer is lost, so the tick below sees the whole
  // interval rather than its last quarter-second. See `archive`.
  for (const sample of batch) archive.set(sample.pui, sample)

  // Sparse archiving: only numeric quantities are kept, since enumerated states mean nothing
  // on a plot.
  const now = Date.now()
  if (now - lastHistoryWrite < HISTORY_INTERVAL_MS) return
  lastHistoryWrite = now

  /*
   * Stamped with the station's clock, not with ours.
   *
   * Arrival time is wrong twice over here. It plots a reading where it was *received* rather than
   * where it was taken, which for a sensor that last spoke a month ago draws a month-old number
   * at today's date — the one thing this application refuses to do everywhere else. And because
   * the store is keyed `['pui', 't']`, a fresh arrival time makes a fresh row: every reconnection
   * re-delivers the last known value of all 163 symbols, so each one filled the ring with copies
   * of the same reading and pruned real history to make room. On the onboard clock the same
   * reading has the same key, and the write is an overwrite.
   *
   * Eight symbols publish no usable timestamp; arrival is their fallback, as it is everywhere.
   */
  const points = [...archive.values()]
    .map((sample) => ({
      pui: sample.pui,
      t: sample.onboardAt ?? sample.receivedAt,
      value: Number.parseFloat(sample.value ?? ''),
    }))
    .filter((point) => Number.isFinite(point.value))
  archive.clear()

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
      const timestamp = update.getValue('TimeStamp')
      // Parsed here, once, rather than wherever it is read: the field is hours since the start of
      // the year and needs the current year to be resolved, so it wants doing while "now" is known.
      const onboard = timestamp ? onboardTimestampToDate(timestamp) : null
      pending.set(pui, {
        pui,
        value: update.getValue('Value'),
        calibrated: update.getValue('CalibratedData'),
        timestamp,
        onboardAt: onboard ? onboard.getTime() : null,
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
  archive.clear()
  lastHistoryWrite = 0
  if (client) {
    if (subscription) client.unsubscribe(subscription)
    client.disconnect()
  }
  client = null
  subscription = null
  useTelemetryStore.getState().setConnection('idle', null)
  useTelemetryStore.getState().setSubscribedCount(0)
}
