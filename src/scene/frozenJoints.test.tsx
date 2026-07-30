// @vitest-environment jsdom
/**
 * Tests for the frozen-joints notice.
 *
 * It exists because of a measurement that looked like a rigging bug and was not: the solar wings
 * came out 50.2° off the Sun, and the explanation was a 13 min 17 s outage — 13.3 min × 3.87°/min
 * = 51.5°. The scene was drawing exactly what it had been told, thirteen minutes earlier, and said
 * nothing about it.
 *
 * So the number in this notice is the point of it, and it is what these tests pin.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FrozenJoints } from './FrozenJoints'
import { useTelemetryStore } from '../telemetry/store'

/** Puts the last update this many milliseconds in the past. */
function lastUpdate(ageMs: number | null) {
  useTelemetryStore.setState({
    connection: 'connected',
    lastUpdateAt: ageMs === null ? null : Date.now() - ageMs,
  })
}

afterEach(() => {
  cleanup()
  useTelemetryStore.setState({ connection: 'idle', lastUpdateAt: null })
})

describe('FrozenJoints', () => {
  it('stays quiet while data is arriving', () => {
    lastUpdate(5_000)
    const { container } = render(<FrozenJoints />)
    expect(container.innerHTML).toBe('')
  })

  it('stays quiet before anything has ever arrived', () => {
    // Nothing to say a station has stopped moving about, if it never started.
    lastUpdate(null)
    const { container } = render(<FrozenJoints />)
    expect(container.innerHTML).toBe('')
  })

  it('speaks once the gap is long enough to matter', () => {
    lastUpdate(10 * 60_000)
    render(<FrozenJoints />)
    expect(screen.getByText(/Joints frozen/)).toBeTruthy()
  })

  it('says how far the Sun has moved since', () => {
    // The whole point: 13 minutes is 50° of solar motion, which is why the arrays look mispointed.
    lastUpdate(13 * 60_000)
    render(<FrozenJoints />)
    expect(screen.getByText(/50°/)).toBeTruthy()
  })

  it('scales the drift with the outage rather than quoting a constant', () => {
    lastUpdate(23.24 * 60_000) // a quarter of an orbit
    render(<FrozenJoints />)
    expect(screen.getByText(/90°/)).toBeTruthy()
  })

  it('is announced without stealing focus', () => {
    lastUpdate(10 * 60_000)
    const { container } = render(<FrozenJoints />)
    expect(container.firstElementChild?.getAttribute('role')).toBe('status')
  })
})
