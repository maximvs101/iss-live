/**
 * Tests for the editorial layer: which symbols are exposed, and what they are attached to.
 *
 * `npm run verify:scene` checks some of this by scraping the file with a regular expression,
 * which cannot see through a refactor. These import the declarations themselves.
 */
import { describe, expect, it } from 'vitest'
import { getSymbol } from '../data/catalog'
import { PART_IDS } from '../scene/parts'
import {
  ALL_CHANNELS,
  SUBSCRIBED_PUIS,
  SUBSYSTEMS,
  channelsForPart,
  getChannel,
  subsystemOfPui,
} from './subsystems'

describe('subscribed symbols', () => {
  it('all exist in the official catalogue', () => {
    // A mistyped PUI would be subscribed and never receive anything — invisible for as long as
    // that channel happens to be quiet.
    const unknown = SUBSCRIBED_PUIS.filter((pui) => !getSymbol(pui))
    expect(unknown).toEqual([])
  })

  it('are free of duplicates', () => {
    expect(new Set(SUBSCRIBED_PUIS).size).toBe(SUBSCRIBED_PUIS.length)
  })

  it('cover every declared channel', () => {
    const subscribed = new Set(SUBSCRIBED_PUIS)
    for (const channel of ALL_CHANNELS) expect(subscribed.has(channel.pui)).toBe(true)
  })

  /*
   * The one a tidy-up would break.
   *
   * A hidden channel has no row, so it looks like dead weight in the declaration — and deleting it
   * would stop the value arriving, because this list *is* the subscription. The onboard clock names
   * a day of the year and reads the year from exactly such a channel.
   */
  it('include the channels that are read without being shown', () => {
    const hidden = ALL_CHANNELS.filter((channel) => channel.hidden)
    expect(hidden.length).toBeGreaterThan(0)
    for (const channel of hidden) expect(SUBSCRIBED_PUIS).toContain(channel.pui)
    expect(hidden.map((channel) => channel.pui)).toContain('TIME_000002')
  })
})

describe('channel declarations', () => {
  it('give every channel a label', () => {
    for (const channel of ALL_CHANNELS) {
      expect(channel.label.trim().length, `${channel.pui} has a label`).toBeGreaterThan(0)
    }
  })

  it('only attach channels to parts that exist', () => {
    const known = new Set<string>(PART_IDS)
    for (const channel of ALL_CHANNELS) {
      if (!channel.part) continue
      expect(known.has(channel.part), `${channel.pui} -> ${channel.part}`).toBe(true)
    }
  })

  it('declare each symbol once', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const channel of ALL_CHANNELS) {
      if (seen.has(channel.pui)) duplicates.push(channel.pui)
      seen.add(channel.pui)
    }
    expect(duplicates).toEqual([])
  })
})

describe('subsystem structure', () => {
  it('gives every subsystem a tagline and at least one section', () => {
    for (const subsystem of SUBSYSTEMS) {
      expect(subsystem.tagline.length).toBeGreaterThan(0)
      expect(subsystem.sections.length).toBeGreaterThan(0)
      expect(subsystem.disciplines.length).toBeGreaterThan(0)
    }
  })

  it('gives every section at least one channel', () => {
    for (const subsystem of SUBSYSTEMS) {
      for (const section of subsystem.sections) {
        expect(section.channels.length, `${subsystem.id}/${section.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('uses distinct section ids within a subsystem', () => {
    for (const subsystem of SUBSYSTEMS) {
      const ids = subsystem.sections.map((section) => section.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('lookups', () => {
  it('finds a channel by symbol', () => {
    expect(getChannel('USLAB000058')?.label).toBe('Cabin pressure')
    expect(getChannel('NOT_A_SYMBOL')).toBeUndefined()
  })

  it('finds the subsystem a symbol belongs to', () => {
    expect(subsystemOfPui('USLAB000058')?.id).toBe('eclss')
    expect(subsystemOfPui('S0000003')?.id).toBe('eps')
    expect(subsystemOfPui('NOT_A_SYMBOL')).toBeUndefined()
  })

  it('lists the channels attached to a part', () => {
    const wing = channelsForPart('saw-1a')
    expect(wing.length).toBeGreaterThan(0)
    for (const channel of wing) expect(channel.part).toBe('saw-1a')
  })

  it('returns nothing for a part with no telemetry', () => {
    // Most structural elements publish nothing, and that is a legitimate answer.
    expect(channelsForPart('pma-1')).toEqual([])
  })
})

describe('the power channels the stream does not publish', () => {
  it('warn the reader rather than presenting a reading', () => {
    // All eight drive currents sit at exactly zero and carry no timestamp. The hint must say so:
    // an earlier version promised that "a negative current means the channel is delivering",
    // describing behaviour never observed.
    const current = getChannel('S4000002')
    expect(current?.hint).toBeDefined()
    expect(current!.hint).toMatch(/not published|zero/i)
    expect(current!.hint).not.toMatch(/negative current means/i)
  })
})
