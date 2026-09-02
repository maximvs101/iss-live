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
const { appendHistory } = await import('../history/indexeddb')

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

  /**
   * The dropout, from the collector's record.
   *
   * Twice in twenty-two days — 11 August 2026 at 16:44 UTC and 19 August at 00:31 — twenty-two
   * symbols read exactly 0 for one minute and returned to their previous value the minute after.
   * The values here are Destiny's, as recorded: 165.849 mmHg of oxygen, then zero, then 165.849
   * again. Kept out at the door, the panel shows the last real reading getting a minute older,
   * which is what happened; let through, it says the crew is breathing nothing.
   */
  it('refuses a zero from a channel that cannot read zero, and keeps every other zero', () => {
    const send = (pui: string, value: string) =>
      fire(captured.subscriptionListeners, 'onItemUpdate', {
        getItemName: () => pui,
        getValue: (field: string) => (field === 'Value' ? value : null),
      })

    connectTelemetry({ items: ['USLAB000053', 'AIRLOCK000049', 'S4000001'] })

    send('USLAB000053', '165.84898488')
    vi.advanceTimersByTime(250)
    expect(useTelemetryStore.getState().samples.USLAB000053.value).toBe('165.84898488')

    send('USLAB000053', '0.000')
    vi.advanceTimersByTime(250)
    // Still the real reading, not the dropout, and not an empty row either.
    expect(useTelemetryStore.getState().samples.USLAB000053.value).toBe('165.84898488')

    send('USLAB000053', '165.84898488')
    vi.advanceTimersByTime(250)
    expect(useTelemetryStore.getState().samples.USLAB000053.value).toBe('165.84898488')

    // A crewlock at zero is a crewlock pumped down for a spacewalk, and an array at zero is an
    // array offline. Both are readings.
    send('AIRLOCK000049', '0')
    send('S4000001', '0')
    vi.advanceTimersByTime(250)
    expect(useTelemetryStore.getState().samples.AIRLOCK000049.value).toBe('0')
    expect(useTelemetryStore.getState().samples.S4000001.value).toBe('0')
  })

  /*
   * The dropout the per-channel list cannot catch.
   *
   * Twenty-two symbols read exactly 0 in the same minute, twice in twenty-two days, and only eight
   * of them are channels where zero is impossible. The other fourteen — the array voltages among
   * them — are caught by the shape of the event instead: several unrelated symbols falling to zero
   * together. The voltages matter most, because a zero that reaches the archive is keyed by the
   * onboard clock and no later reading overwrites it.
   */
  it('drops a batch of symbols that fall to zero together', () => {
    const send = (pui: string, value: string) =>
      fire(captured.subscriptionListeners, 'onItemUpdate', {
        getItemName: () => pui,
        getValue: (field: string) => (field === 'Value' ? value : null),
      })
    const volts = ['S4000001', 'S4000004', 'S6000004', 'S6000001']

    connectTelemetry({ items: volts })
    for (const pui of volts) send(pui, '159.5')
    vi.advanceTimersByTime(250)
    for (const pui of volts) expect(useTelemetryStore.getState().samples[pui].value).toBe('159.5')

    for (const pui of volts) send(pui, '0')
    vi.advanceTimersByTime(250)
    // The last real reading, still standing and now a quarter-second older.
    for (const pui of volts) expect(useTelemetryStore.getState().samples[pui].value).toBe('159.5')
  })

  it('lets a smaller fall through, because that is a reading', () => {
    const send = (pui: string, value: string) =>
      fire(captured.subscriptionListeners, 'onItemUpdate', {
        getItemName: () => pui,
        getValue: (field: string) => (field === 'Value' ? value : null),
      })

    connectTelemetry({ items: ['S4000001', 'S4000004', 'S6000004'] })
    for (const pui of ['S4000001', 'S4000004', 'S6000004']) send(pui, '159.5')
    vi.advanceTimersByTime(250)
    for (const pui of ['S4000001', 'S4000004', 'S6000004']) send(pui, '0')
    vi.advanceTimersByTime(250)

    // Three arrays at zero is an array offline, not a broadcast fault.
    expect(useTelemetryStore.getState().samples.S4000001.value).toBe('0')
  })

  it('does not count a symbol that was already zero', () => {
    // The eight drive currents publish 0 and nothing else. If holding zero counted as falling to
    // zero, they alone would trip the guard on every flush and the panel would never update.
    const send = (pui: string, value: string) =>
      fire(captured.subscriptionListeners, 'onItemUpdate', {
        getItemName: () => pui,
        getValue: (field: string) => (field === 'Value' ? value : null),
      })
    const currents = ['S4000002', 'S4000005', 'S6000005', 'S6000002', 'P4000002']

    connectTelemetry({ items: [...currents, 'S4000001'] })
    for (const pui of currents) send(pui, '0')
    send('S4000001', '159.5')
    vi.advanceTimersByTime(250)

    for (const pui of currents) send(pui, '0')
    send('S4000001', '0')
    vi.advanceTimersByTime(250)

    // One genuine fall among five symbols that never left zero: not a dropout.
    expect(useTelemetryStore.getState().samples.S4000001.value).toBe('0')
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

  /**
   * The archive is not the display buffer, and the two empty at different rates.
   *
   * The display flushes every 250 ms and the archive writes every 5 s, so archiving from the
   * flush's own batch captured one twentieth of an interval. Measured on the live stream over
   * 55 s with all 163 symbols subscribed: 526 points where 1 956 were intended, and the median
   * symbol held a single one. Three symbols on three different quarter-seconds are enough to
   * state the property here.
   */
  it('archives everything that arrived in the interval, not the last quarter-second of it', () => {
    const value = (pui: string, v: string) =>
      fire(captured.subscriptionListeners, 'onItemUpdate', {
        getItemName: () => pui,
        getValue: (field: string) => (field === 'Value' ? v : field === 'TimeStamp' ? '5088.5' : null),
      })

    connectTelemetry({ items: ['A', 'B', 'C'] })

    // The first flush of a session always archives, so get it out of the way and start the clock.
    value('A', '1')
    vi.advanceTimersByTime(250)
    vi.mocked(appendHistory).mockClear()

    // Three arrivals, three different flushes, all inside one archive interval.
    value('A', '2')
    vi.advanceTimersByTime(250)
    value('B', '3')
    vi.advanceTimersByTime(250)
    expect(appendHistory).not.toHaveBeenCalled()

    value('C', '4')
    vi.advanceTimersByTime(250)

    // The interval elapses, and then one more arrival opens the gate — `flush` returns early
    // on an empty buffer, so the archive writes when the stream next speaks rather than on a
    // timer of its own. On a live stream that is every quarter-second.
    vi.advanceTimersByTime(4500)
    value('C', '4')
    vi.advanceTimersByTime(250)

    expect(appendHistory).toHaveBeenCalledTimes(1)
    const points = vi.mocked(appendHistory).mock.calls[0][0]
    expect(points.map((point) => point.pui).sort()).toEqual(['A', 'B', 'C'])
    // And the latest value of each, not the first.
    expect(points.find((point) => point.pui === 'A')?.value).toBe(2)
  })

  /**
   * The archived point is stamped with the station's clock.
   *
   * Two things turn on it. A reading is plotted where it was taken rather than where it landed —
   * a sensor that last spoke a month ago would otherwise draw a month-old number at today's date.
   * And the store is keyed `['pui', 't']`, so a reconnection — which re-delivers the last known
   * value of every symbol with a fresh arrival time — writes the same key and overwrites, instead
   * of filling the ring with copies of one reading.
   */
  it('stamps an archived point with the onboard clock, so a re-delivery overwrites it', () => {
    const deliver = () =>
      fire(captured.subscriptionListeners, 'onItemUpdate', {
        getItemName: () => 'A',
        getValue: (field: string) =>
          field === 'Value' ? '749.2' : field === 'TimeStamp' ? '5088.5' : null,
      })

    connectTelemetry({ items: ['A'] })
    deliver()
    vi.advanceTimersByTime(250)

    const first = vi.mocked(appendHistory).mock.calls.at(-1)![0]
    // The same instant the store test pins from the same timestamp: day 212 of 2026, 00:30 UTC.
    expect(first[0].t).toBe(Date.parse('2026-07-31T00:30:00.000Z'))
    expect(first[0].t).not.toBe(Date.now())

    // The same reading arriving again five seconds later carries the same key, so `put` replaces.
    vi.advanceTimersByTime(5000)
    deliver()
    vi.advanceTimersByTime(250)
    const second = vi.mocked(appendHistory).mock.calls.at(-1)![0]
    expect(second[0].t).toBe(first[0].t)
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
