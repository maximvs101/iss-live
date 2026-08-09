// @vitest-environment jsdom
/**
 * The pass panel's summary line, which used to answer a question it had not asked.
 *
 * Passes were computed only while the panel was open — a saving worth 17 ms — but the summary sits
 * on screen whether the panel is open or shut and reads straight off that array. Folded, over a
 * location with sixteen passes in the next three days, it read:
 *
 *     0 passes above 10° in the next 72 hours, none of them visible to the naked eye — every one
 *     falls in daylight or in the Earth's shadow.
 *
 * A count, a qualification, and a reason, all of them confident and none of them computed. This
 * holds the panel to the engine's answer in the state a visitor sees first.
 *
 * The elements come from the built-in fallback, with the network refused: no fixture to go stale,
 * and the same orbit every run. The clock is pinned for the same reason.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useOrbitStore } from '../orbit/useOrbit'
import { useObserverStore } from '../orbit/observer'
import { loadOrbitalElements, type OrbitalElements } from '../orbit/tle'
import { findPasses } from '../orbit/passes'
import { PassesPanel } from './PassesPanel'

/** Paris: inside the station's 51.6° of latitude, so there is always something to find. */
const PARIS = { latitude: 48.8566, longitude: 2.3522, altitudeM: 35 }
const NOW = new Date('2026-08-09T12:00:00Z')

let elements: OrbitalElements

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline on purpose'))

  elements = await loadOrbitalElements()
  useOrbitStore.setState({ elements })
  useObserverStore.setState({ observer: PARIS })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the passes panel', () => {
  it('states the real count while it is still folded shut', () => {
    // What the engine says, asked independently of the component.
    const expected = findPasses(elements.satrec, PARIS, NOW, { hours: 72, minElevation: 10 })
    expect(expected.length).toBeGreaterThan(0)

    render(<PassesPanel />)

    // Shut is the state a visitor meets first, and the one the bug lived in.
    const details = document.querySelector('details')
    expect(details?.open).toBeFalsy()

    const summary = document.querySelector('.panel__summary')?.textContent ?? ''
    expect(summary).toContain(`${expected.length} passes`)
    expect(summary).not.toMatch(/^0 passes/)
  })

  it('agrees with the engine on how many are worth going outside for', () => {
    const computed = findPasses(elements.satrec, PARIS, NOW, { hours: 72, minElevation: 10 })
    const visible = computed.filter((pass) => pass.visible).length

    render(<PassesPanel />)
    const summary = document.querySelector('.panel__summary')?.textContent ?? ''

    // The panel words this two ways round; either is right, and neither may invent a number.
    if (visible === 0) {
      expect(summary).toContain('none of them visible')
    } else {
      expect(summary).toContain(`${visible}`)
    }
  })

  it('says to set a location rather than counting passes over nowhere', () => {
    useObserverStore.setState({ observer: null })
    render(<PassesPanel />)
    // Said in more than one place — the designation beside the title and the prompt inside — which
    // is why this counts them rather than insisting on exactly one.
    expect(screen.getAllByText(/Set a location/i).length).toBeGreaterThan(0)
    expect(document.querySelector('.panel__summary')?.textContent ?? '').not.toMatch(/\d+ passes/)
  })
})
