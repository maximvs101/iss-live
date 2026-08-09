/**
 * How this application wires itself to the Lightstreamer SDK.
 *
 * The wire contract is checked elsewhere, against the real server: `check:stream` and
 * `verify:telemetry` open a TLCP session by hand and report what NASA actually sends. What none of
 * them touch is this file — whether the subscription is built with the right mode and schema,
 * whether the SDK's status strings are read correctly, and whether an update becomes a store entry
 * with the station's own clock on it.
 *
 * The SDK is mocked because none of that needs a socket, and because the interesting statuses are
 * ones a healthy connection never produces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Listeners handed to the mocked SDK, so a test can drive them. */
interface Captured {
  clientListeners: Record<string, (...args: never[]) => void>[]
  subscriptionListeners: Record<string, (...args: never[]) => void>[]
  subscription: { mode?: string; items?: string[]; schema?: string[]; snapshot?: string; maxFrequency?: number } | null
  connected: number
  disconnected: number
}

const captured: Captured = {
  clientListeners: [],
  subscriptionListeners: [],
  subscription: null,
  connected: 0,
  disconnected: 0,
}

vi.mock('lightstreamer-client-web', () => ({
  LightstreamerClient: class {
    addListener(listener: Record<string, (...args: never[]) => void>) {
      captured.clientListeners.push(listener)
    }
    subscribe() {}
    unsubscribe() {}
    connect() {
      captured.connected += 1
    }
    disconnect() {
      captured.disconnected += 1
    }
  },
  Subscription: class {
    constructor(mode: string, items: string[], schema: string[]) {
      captured.subscription = { mode, items, schema }
    }
    setRequestedSnapshot(snapshot: string) {
      if (captured.subscription) captured.subscription.snapshot = snapshot
    }
    setRequestedMaxFrequency(frequency: number) {
      if (captured.subscription) captured.subscription.maxFrequency = frequency
    }
    addListener(listener: Record<string, (...args: never[]) => void>) {
      captured.subscriptionListeners.push(listener)
    }
  },
}))

// The archive is not what is under test here, and it wants an IndexedDB.
vi.mock('../history/indexeddb', () => ({ appendHistory: vi.fn().mockResolvedValue(undefined) }))

const { connectTelemetry, disconnectTelemetry } = await import('./client')
const { useTelemetryStore } = await import('./store')

/** Drives every registered listener that implements `name`. */
function fire(listeners: Captured['clientListeners'], name: string, ...args: unknown[]) {
  for (const listener of listeners) listener[name]?.(...(args as never[]))
}

beforeEach(() => {
  captured.clientListeners = []
  captured.subscriptionListeners = []
  captured.subscription = null
  captured.connected = 0
  captured.disconnected = 0
  useTelemetryStore.getState().reset()
  vi.useFakeTimers()
  // Pinned, because the onboard timestamp carries no year: it is resolved against the current one,
  // so an unpinned clock would make the assertion below start failing on 1 January.
  vi.setSystemTime(new Date('2026-08-02T12:00:00Z'))
})

afterEach(() => {
  disconnectTelemetry()
  vi.useRealTimers()
})

describe('the Lightstreamer client', () => {
  it('subscribes in the shape the ISSLIVE adapter expects', () => {
    connectTelemetry({ items: ['USLAB000058', 'AIRLOCK000049'] })

    expect(captured.subscription?.mode).toBe('MERGE')
    expect(captured.subscription?.items).toEqual(['USLAB000058', 'AIRLOCK000049'])
    // The schema is the contract verified against the public server on 28/07/2026.
    expect(captured.subscription?.schema).toEqual([
      'TimeStamp',
      'Value',
      'Status.Class',
      'Status.Indicator',
      'Status.Color',
      'CalibratedData',
    ])
    // Without the snapshot, a symbol that publishes hourly shows nothing until it next does.
    expect(captured.subscription?.snapshot).toBe('yes')
    expect(captured.connected).toBe(1)
    expect(useTelemetryStore.getState().connection).toBe('connecting')
  })

  it('asks for nothing when there is nothing to ask for', () => {
    connectTelemetry({ items: [] })
    expect(captured.connected).toBe(0)
    expect(captured.subscription).toBeNull()
  })

  it('reads the SDK status strings, including the two that are not failures', () => {
    connectTelemetry({ items: ['A'] })

    const cases: [string, string][] = [
      ['CONNECTED:WS-STREAMING', 'connected'],
      ['STALLED', 'stalled'],
      ['CONNECTING', 'connecting'],
      // These two say the SDK is still working on it. Reading them as "disconnected" would put the
      // watchdog to work reopening a session that is already being reopened.
      ['DISCONNECTED:WILL-RETRY', 'connecting'],
      ['DISCONNECTED:TRYING-RECOVERY', 'connecting'],
      ['DISCONNECTED', 'disconnected'],
    ]

    for (const [status, expected] of cases) {
      fire(captured.clientListeners, 'onStatusChange', status)
      expect(useTelemetryStore.getState().connection, status).toBe(expected)
    }
  })

  it('treats a server error and a refused subscription as disconnected', () => {
    connectTelemetry({ items: ['A'] })

    fire(captured.clientListeners, 'onServerError', 17, 'no adapter')
    expect(useTelemetryStore.getState().connection).toBe('disconnected')
    expect(useTelemetryStore.getState().connectionDetail).toContain('17')

    fire(captured.subscriptionListeners, 'onSubscriptionError', 23, 'bad item')
    expect(useTelemetryStore.getState().connection).toBe('disconnected')
  })

  it('reports how many symbols the server actually confirmed', () => {
    connectTelemetry({ items: ['A', 'B', 'C'] })
    fire(captured.subscriptionListeners, 'onSubscription')
    expect(useTelemetryStore.getState().subscribedCount).toBe(3)

    fire(captured.subscriptionListeners, 'onUnsubscription')
    expect(useTelemetryStore.getState().subscribedCount).toBe(0)
  })

  it('buffers updates and flushes them together, carrying the station clock', () => {
    connectTelemetry({ items: ['A'] })

    const fields: Record<string, string> = {
      TimeStamp: '5088.5',
      Value: '749.2',
      CalibratedData: '749.2',
      'Status.Class': 'S',
      'Status.Indicator': 'N',
      'Status.Color': 'G',
    }
    fire(captured.subscriptionListeners, 'onItemUpdate', {
      getItemName: () => 'A',
      getValue: (field: string) => fields[field] ?? null,
    })

    // Nothing yet: the buffer exists so that a hundred updates a second do not become a hundred
    // React renders.
    expect(useTelemetryStore.getState().samples.A).toBeUndefined()

    vi.advanceTimersByTime(250)

    const sample = useTelemetryStore.getState().samples.A
    expect(sample.value).toBe('749.2')
    expect(sample.statusClass).toBe('S')
    /*
     * The onboard timestamp is hours since the start of the year, parsed here rather than wherever
     * it is read, on the origin where hour 24 is 1 January 00:00 UTC.
     *
     * (5088.5 - 24) / 24 = 211.0208 days after that instant, so day 212 of 2026 — 31 July — at
     * half past midnight. Worked from the convention rather than from the code: the same
     * arithmetic on the anchor NASA's own clock confirmed, 5036.2715 h, gives day 209.8446, which
     * is what the station reported.
     */
    expect(new Date(sample.onboardAt!).toISOString()).toBe('2026-07-31T00:30:00.000Z')
    expect(useTelemetryStore.getState().newestOnboardAt).toBe(sample.onboardAt)
  })

  it('keeps only the latest update per symbol between flushes', () => {
    connectTelemetry({ items: ['A'] })
    for (const value of ['1', '2', '3']) {
      fire(captured.subscriptionListeners, 'onItemUpdate', {
        getItemName: () => 'A',
        getValue: (field: string) => (field === 'Value' ? value : null),
      })
    }
    vi.advanceTimersByTime(250)

    expect(useTelemetryStore.getState().samples.A.value).toBe('3')
    // Three arrivals, one store entry: the count is of traffic, the sample is the newest.
    expect(useTelemetryStore.getState().updateCount).toBe(1)
  })

  it('goes quiet on disconnect, and stops flushing', () => {
    connectTelemetry({ items: ['A'] })
    disconnectTelemetry()

    expect(captured.disconnected).toBe(1)
    expect(useTelemetryStore.getState().connection).toBe('idle')
    expect(useTelemetryStore.getState().subscribedCount).toBe(0)

    // The flush timer must be gone with it, or a closed session keeps a timer alive for the life
    // of the page.
    fire(captured.subscriptionListeners, 'onItemUpdate', {
      getItemName: () => 'A',
      getValue: () => '9',
    })
    vi.advanceTimersByTime(1000)
    expect(useTelemetryStore.getState().samples.A).toBeUndefined()
  })
})
