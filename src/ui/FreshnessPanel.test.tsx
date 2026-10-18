// @vitest-environment jsdom
/**
 * The freshness panel reads the store on its own five-second clock.
 *
 * The store flushes four times a second while the stream runs; the panel's boundaries are a minute
 * and an hour. It used to subscribe to every flush anyway, recomputing 163 readings each time
 * while its comment said it did not.
 */
import { Profiler, act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FreshnessPanel } from './FreshnessPanel'
import { useTelemetryStore, type TelemetrySample } from '../telemetry/store'
import { SUBSYSTEMS } from '../telemetry/subsystems'

const PUI = SUBSYSTEMS[0].sections[0].channels[0].pui

function sample(over: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    pui: PUI,
    value: '1',
    calibrated: null,
    timestamp: null,
    statusClass: null,
    statusIndicator: null,
    statusColor: null,
    receivedAt: Date.now(),
    onboardAt: Date.now(),
    ...over,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  useTelemetryStore.getState().reset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('FreshnessPanel', () => {
  it('does not re-render on store flushes, only on its own clock', () => {
    let commits = 0
    render(
      <Profiler id="freshness" onRender={() => (commits += 1)}>
        <FreshnessPanel />
      </Profiler>,
    )
    const afterMount = commits

    for (let i = 0; i < 20; i += 1) {
      act(() => useTelemetryStore.getState().applyBatch([sample({ value: String(i) })]))
    }
    expect(commits).toBe(afterMount)

    act(() => vi.advanceTimersByTime(5_000))
    expect(commits).toBe(afterMount + 1)
  })

  it('shows what arrived at its next tick', () => {
    render(<FreshnessPanel />)
    const cell = () => screen.getAllByRole('img').find((el) => el.getAttribute('aria-label')?.includes(','))!
    const before = screen.getAllByRole('img').map((el) => el.className).join(' ')

    act(() => useTelemetryStore.getState().applyBatch([sample()]))
    act(() => vi.advanceTimersByTime(5_000))

    expect(screen.getAllByRole('img').map((el) => el.className).join(' ')).not.toBe(before)
    expect(cell()).toBeTruthy()
  })
})
