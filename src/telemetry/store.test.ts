/**
 * The telemetry store, and the one rule in it that carries a bug fix.
 *
 * `newestOnboardAt` only ever moves forward. That is not tidiness: it is what stops a reconnection
 * from faking liveness. Re-subscribing re-delivers the last known values, and they arrive *now*, so
 * a freshness measured from arrival turns the light green over a station that has sent nothing for
 * days. Reading the station's own clock instead is the fix, and it only works because a batch of
 * old readings cannot drag the newest backwards.
 *
 * That rule lived in four lines of a zustand reducer with nothing checking it, in a module that was
 * reached by exactly one test, sideways.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readNumber, useTelemetryStore, type TelemetrySample } from './store'

/** A sample with only the fields these tests care about. */
function sample(pui: string, over: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    pui,
    value: '1',
    calibrated: null,
    timestamp: null,
    statusClass: null,
    statusIndicator: null,
    statusColor: null,
    receivedAt: 1_000,
    onboardAt: null,
    ...over,
  }
}

beforeEach(() => {
  useTelemetryStore.getState().reset()
})

describe('the telemetry store', () => {
  it('keeps the latest sample per symbol and counts every update', () => {
    const { applyBatch } = useTelemetryStore.getState()
    applyBatch([sample('A', { value: '1' }), sample('B', { value: '2' })])
    applyBatch([sample('A', { value: '3' })])

    const state = useTelemetryStore.getState()
    expect(state.samples.A.value).toBe('3')
    expect(state.samples.B.value).toBe('2')
    // Three updates arrived, over two symbols: the count is of traffic, not of symbols.
    expect(state.updateCount).toBe(3)
  })

  it('takes the newest onboard reading across symbols, not the last one in the batch', () => {
    // The symbols run at wildly different rates — joint angles seconds old beside partial-pressure
    // sensors weeks back — so the order they arrive in says nothing about which is freshest.
    useTelemetryStore.getState().applyBatch([
      sample('FRESH', { onboardAt: 5_000 }),
      sample('STALE', { onboardAt: 1_000 }),
    ])
    expect(useTelemetryStore.getState().newestOnboardAt).toBe(5_000)
  })

  it('never lets the station clock run backwards', () => {
    // The reported bug, in miniature. The stream goes quiet at t=9000; the page re-subscribes and
    // the server replays the snapshot — the same old readings, arriving now. If this rewound the
    // clock it would be harmless; what matters is that it must not *advance* it, and the guard that
    // stops one also stops the other.
    const { applyBatch } = useTelemetryStore.getState()
    applyBatch([sample('A', { onboardAt: 9_000 })])
    expect(useTelemetryStore.getState().newestOnboardAt).toBe(9_000)

    applyBatch([sample('A', { onboardAt: 2_000, receivedAt: 99_000 })])
    expect(useTelemetryStore.getState().newestOnboardAt).toBe(9_000)
  })

  it('ignores symbols that carry no usable onboard time', () => {
    // Eight of the 163 subscribed symbols publish a timestamp that parses to nothing.
    const { applyBatch } = useTelemetryStore.getState()
    applyBatch([sample('NO_CLOCK', { onboardAt: null })])
    expect(useTelemetryStore.getState().newestOnboardAt).toBeNull()

    applyBatch([sample('CLOCK', { onboardAt: 4_000 }), sample('NO_CLOCK', { onboardAt: null })])
    expect(useTelemetryStore.getState().newestOnboardAt).toBe(4_000)
  })

  it('advances the arrival clock separately from the station clock', () => {
    // Both are needed: the station's for freshness, arrival for "is the socket alive at all".
    useTelemetryStore.getState().applyBatch([sample('A', { receivedAt: 7_000, onboardAt: 3_000 })])
    const state = useTelemetryStore.getState()
    expect(state.lastUpdateAt).toBe(7_000)
    expect(state.newestOnboardAt).toBe(3_000)
  })

  it('treats an empty batch as nothing at all', () => {
    const before = useTelemetryStore.getState()
    useTelemetryStore.getState().applyBatch([])
    const after = useTelemetryStore.getState()
    expect(after.updateCount).toBe(0)
    expect(after.samples).toBe(before.samples)
  })

  it('reads a number only when there is one', () => {
    useTelemetryStore.getState().applyBatch([
      sample('NUM', { value: '20.5' }),
      sample('TEXT', { value: 'Open' }),
      sample('EMPTY', { value: '' }),
      sample('NULL', { value: null }),
    ])
    expect(readNumber('NUM')).toBe(20.5)
    expect(readNumber('TEXT')).toBeNull()
    expect(readNumber('EMPTY')).toBeNull()
    expect(readNumber('NULL')).toBeNull()
    expect(readNumber('NEVER_SEEN')).toBeNull()
  })
})
