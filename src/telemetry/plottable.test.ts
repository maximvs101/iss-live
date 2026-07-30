/**
 * Tests for the curated list of plottable channels.
 *
 * These cannot tell whether a channel is *interesting* — that is measured against the live stream
 * by `npm run verify:plottable`. What they pin is everything a unit test can: the list refers to
 * channels the application actually subscribes to, offers nothing that would draw a meaningless
 * curve, and never repeats itself.
 */
import { describe, expect, it } from 'vitest'
import { PLOTTABLE, defaultPlot } from './plottable'
import { SUBSYSTEMS, SUBSCRIBED_PUIS, getChannel, type SubsystemId } from './subsystems'
import { getSymbol } from '../data/catalog'

const offered = Object.values(PLOTTABLE).flat()

describe('PLOTTABLE', () => {
  it('covers every subsystem', () => {
    // A missing key would crash the picker; an extra one would be dead weight.
    expect(Object.keys(PLOTTABLE).sort()).toEqual(SUBSYSTEMS.map((s) => s.id).sort())
  })

  it('only offers channels the application subscribes to', () => {
    // Offering an unsubscribed symbol would draw an empty chart for ever: nothing arrives for it.
    for (const pui of offered) expect(SUBSCRIBED_PUIS).toContain(pui)
  })

  it('names every channel it offers', () => {
    // The picker shows labels, not identifiers.
    for (const pui of offered) expect(getChannel(pui)?.label ?? getSymbol(pui)?.description).toBeTruthy()
  })

  it('never offers the same channel twice', () => {
    expect(new Set(offered).size).toBe(offered.length)
  })

  it('files each channel under the subsystem it belongs to', () => {
    // A thermal channel in the power menu would be a quiet filing error, invisible in the UI.
    for (const [subsystem, puis] of Object.entries(PLOTTABLE)) {
      const owned = new Set(
        SUBSYSTEMS.find((s) => s.id === subsystem)!.sections.flatMap((section) =>
          section.channels.map((channel) => channel.pui),
        ),
      )
      for (const pui of puis) expect(owned).toContain(pui)
    }
  })

  it('offers no enumerated symbol', () => {
    // A mode or an on/off flag plots as a step function and says nothing the value display does
    // not already say outright.
    // The catalogue writes `null`, not `undefined`, for a symbol with no enumeration.
    for (const pui of offered) expect(getSymbol(pui)?.values ?? null).toBeNull()
  })

  it('offers none of the channels known to be dead', () => {
    // The eight array drive currents sit at exactly zero and publish no timestamp at all; the
    // partial pressures, cabin pressure and total mass are weeks stale. Every one of them is the
    // kind of channel someone would reach for first, which is why they are named here explicitly.
    const stalled = [
      'S4000002', 'S4000005', 'S6000005', 'S6000002',
      'P4000002', 'P4000005', 'P6000005', 'P6000002',
      'USLAB000058', 'USLAB000053', 'USLAB000054', 'USLAB000055',
      'NODE3000001', 'NODE3000002', 'NODE3000003',
      'AIRLOCK000054', 'USLAB000039',
    ]
    for (const pui of stalled) expect(offered).not.toContain(pui)
  })

  it('offers no clock', () => {
    for (const pui of ['TIME_000001', 'TIME_000002', 'USLAB000084', 'USLAB000085']) {
      expect(offered).not.toContain(pui)
    }
  })

  it('leaves command & data handling empty on purpose', () => {
    // Stated as a test so that filling it later is a decision rather than an accident: every
    // channel there is a state, a clock or a counter.
    expect(PLOTTABLE.cdh).toEqual([])
    expect(defaultPlot('cdh')).toBeNull()
  })

  it('gives every other subsystem a default that is on its own list', () => {
    for (const subsystem of SUBSYSTEMS) {
      const first = defaultPlot(subsystem.id as SubsystemId)
      if (PLOTTABLE[subsystem.id].length === 0) expect(first).toBeNull()
      else expect(PLOTTABLE[subsystem.id]).toContain(first!)
    }
  })

  it('keeps each menu short enough to read', () => {
    // The whole point of curating is that the menu can be scanned. Beyond a dozen it cannot.
    for (const puis of Object.values(PLOTTABLE)) expect(puis.length).toBeLessThanOrEqual(12)
  })
})
