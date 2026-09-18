// @vitest-environment jsdom
/**
 * The one rule of this component, tested where it used to break: an age that keeps counting.
 *
 * The row re-rendered only when its sample changed, and read the clock while rendering. So a row
 * drawn at age 0 and then left alone by a broadcast outage went on saying nothing at all about its
 * age — the exact moment the age is the whole message. Written to fail on that code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { TelemetryValue } from './TelemetryValue'
import { useTelemetryStore } from '../telemetry/store'

const PUI = 'USLAB000058'

/** The station's own timestamp format — hours since the year began, offset by a day. */
function onboardStamp(ms: number): string {
  const year = new Date(ms).getUTCFullYear()
  return String((ms - Date.UTC(year, 0, 1)) / 3_600_000 + 24)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
})

afterEach(() => {
  cleanup()
  useTelemetryStore.getState().reset()
  vi.useRealTimers()
})

describe('TelemetryValue', () => {
  it('shows an age once the reading turns stale, even when nothing else re-renders it', () => {
    const now = Date.now()
    useTelemetryStore.getState().applyBatch([
      {
        pui: PUI,
        value: '98.4',
        calibrated: null,
        timestamp: onboardStamp(now),
        statusClass: null,
        statusIndicator: null,
        statusColor: null,
        receivedAt: now,
        onboardAt: now,
      },
    ])

    const { container } = render(<TelemetryValue pui={PUI} />)
    expect(container.querySelector('.telemetry-row__age')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(120_000)
    })

    const age = container.querySelector('.telemetry-row__age')
    expect(age).not.toBeNull()
    expect(age?.textContent).toBe('2 min 0 s')
  })
})
