/**
 * Tests for the display of telemetry values.
 *
 * These target the rules the application must never break, and the decodings that cost real
 * effort to establish. A regression in any of them would be silent: the interface would still
 * render a plausible-looking number.
 */
import { describe, expect, it } from 'vitest'
import type { PuiSymbol } from '../data/catalog'
import { formatValue, isUnitInferred, resolveUnit, unitNote } from './units'

/** A catalogue entry with only the fields under test filled in. */
function symbol(overrides: Partial<PuiSymbol> & { pui: string }): PuiSymbol {
  return {
    discipline: 'TEST',
    description: 'test symbol',
    units: null,
    opsNom: null,
    engNom: null,
    min: null,
    max: null,
    values: null,
    precision: null,
    ...overrides,
  }
}

describe('formatValue', () => {
  it('reports missing data as missing, never as zero', () => {
    // The rule the whole application rests on: an absent measurement must not be rendered as a
    // number a reader could mistake for one.
    for (const raw of [null, undefined, '']) {
      expect(formatValue(symbol({ pui: 'X000001' }), raw).text).toBeNull()
    }
  })

  it('keeps a genuine zero', () => {
    // The counterpart: zero is a real reading and must survive.
    expect(formatValue(symbol({ pui: 'X000001' }), '0').text).toBe('0')
  })

  it('decodes an enumerated symbol to its state label', () => {
    const pump = symbol({ pui: 'X000002', values: { '1': 'PROCESS', '2': 'STANDBY' } })
    const result = formatValue(pump, '2')

    expect(result.state).toBe('STANDBY')
    expect(result.text).toBe('STANDBY')
    // A state has no unit to show beside it.
    expect(result.unit).toBeNull()
  })

  it('decodes an enumerated value that arrives with decimals', () => {
    // Sensors publish the same state as "2" or "2.00" depending on which one is speaking.
    const pump = symbol({ pui: 'X000002', values: { '2': 'STANDBY' } })
    expect(formatValue(pump, '2.00').state).toBe('STANDBY')
  })

  it('falls back to the raw value when a state is not in the catalogue', () => {
    const pump = symbol({ pui: 'X000002', values: { '1': 'PROCESS' } })
    const result = formatValue(pump, '7')

    expect(result.state).toBeNull()
    expect(result.text).toBe('7')
  })

  it('scales precision to the magnitude', () => {
    const s = symbol({ pui: 'X000003' })
    expect(formatValue(s, '0.123456').text).toBe('0.12')
    expect(formatValue(s, '23.456').text).toBe('23.5')
    expect(formatValue(s, '6790.53').text).toBe('6791')
  })

  it('shows whole numbers without decimals', () => {
    // "4 gyroscopes online", not "4.00".
    expect(formatValue(symbol({ pui: 'X000004' }), '4').text).toBe('4')
  })

  it('honours the precision the catalogue states', () => {
    const s = symbol({ pui: 'X000005', precision: 3 })
    expect(formatValue(s, '23.456789').text).toBe('23.457')
  })

  it('passes non-numeric values through untouched', () => {
    expect(formatValue(symbol({ pui: 'X000006' }), 'AUTOTRACK').text).toBe('AUTOTRACK')
  })
})

describe('onboard time', () => {
  /*
   * TIME_000001 publishes milliseconds, and *not* from the start of the year: the origin is
   * 31 December 00:00 UTC of the year before, the same convention the stream's `TimeStamp` field
   * uses where hour 24 is 1 January. Read the obvious way it lands a day late, which is why the
   * live reading below is pinned rather than described.
   */
  const clock = symbol({ pui: 'TIME_000001', units: 'MS' })

  it('renders the day of the year and the time within it', () => {
    // 209.8446 days = day 209 at 20:16:15 UTC.
    const result = formatValue(clock, String(209.844618 * 86_400_000))

    expect(result.text).toBe('Day 209 · 20:16')
    // No unit badge: the label says GMT, and the row is the widest in its subsystem.
    expect(result.unit).toBeNull()
  })

  it('places midnight at the start of a day', () => {
    expect(formatValue(clock, String(210 * 86_400_000)).text).toBe('Day 210 · 00:00')
  })

  it('pads hours and minutes', () => {
    // Day 5 at 01:02:03 — the seconds are computed and not shown.
    const ms = (5 + (1 * 3600 + 2 * 60 + 3) / 86_400) * 86_400_000
    expect(formatValue(clock, String(ms)).text).toBe('Day 5 · 01:02')
  })

  it('names the date once the station has said which year it is', () => {
    // Read off the live stream on 31 August 2026 at 13:41:43 UTC, arriving 2.9 s behind it.
    expect(formatValue(clock, '21044500918', 2026).text).toBe('Day 243 · 31 Aug 2026 · 13:41')
  })

  it('reads the same value a day late if the origin is taken as 1 January', () => {
    // The mistake this convention invites, pinned so the fix is not undone by someone tidying it.
    const naive = new Date(Date.UTC(2026, 0, 1) + 21044500918)
    expect(naive.toISOString().slice(0, 10)).toBe('2026-09-01')
    expect(formatValue(clock, '21044500918', 2026).text).toContain('31 Aug')
  })

  it('gets February right in a leap year, for nothing', () => {
    // Day 60 of 2028 is 29 February; of 2026, 1 March. The arithmetic is a Date, not a table.
    expect(formatValue(clock, String(60.5 * 86_400_000), 2028).text).toBe('Day 60 · 29 Feb 2028 · 12:00')
    expect(formatValue(clock, String(60.5 * 86_400_000), 2026).text).toBe('Day 60 · 1 Mar 2026 · 12:00')
  })

  it('says the day and the time when the year has not arrived', () => {
    // The year is a second subscription and may be missing; the clock still reads.
    expect(formatValue(clock, '21044500918').text).toBe('Day 243 · 13:41')
    expect(formatValue(clock, '21044500918', null).text).toBe('Day 243 · 13:41')
  })

  it('does not crash on a value that is not a number', () => {
    expect(formatValue(clock, 'nonsense').text).toBe('nonsense')
  })
})

describe('resolveUnit', () => {
  it('prefers the correction table over the catalogue', () => {
    // The catalogue claims PSIA for cabin pressure; the live value of 749 is mmHg.
    expect(resolveUnit(symbol({ pui: 'USLAB000058', units: 'PSIA' }))).toBe('mmHg')
  })

  it('hides units that mean nothing to a reader', () => {
    for (const units of ['CNT', 'ND', 'N/A', 'INTEGR']) {
      expect(resolveUnit(symbol({ pui: 'X000007', units }))).toBeNull()
    }
  })

  it('maps catalogue codes to readable labels', () => {
    expect(resolveUnit(symbol({ pui: 'X000008', units: 'DEG' }))).toBe('°')
    expect(resolveUnit(symbol({ pui: 'X000009', units: 'LBM/D' }))).toBe('lb/day')
  })

  it('returns null when the source publishes no unit', () => {
    expect(resolveUnit(symbol({ pui: 'X000010', units: null }))).toBeNull()
  })
})

describe('confidence in a unit', () => {
  it('marks a deduced unit as inferred', () => {
    // Z1000015 has no unit in the catalogue; degrees is our deduction from the other axis of
    // the same antenna, and the interface must say so.
    expect(isUnitInferred('Z1000015')).toBe(true)
  })

  it('does not mark a unit confirmed against live data', () => {
    expect(isUnitInferred('USLAB000058')).toBe(false)
  })

  it('explains a correction where one was made', () => {
    expect(unitNote('USLAB000058')).toMatch(/mmHg/)
    expect(unitNote('X000011')).toBeUndefined()
  })
})
