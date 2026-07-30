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
  // TIME_000001 publishes milliseconds elapsed since the start of the year. Raw, it reads
  // "18126959000 ms", which tells a reader nothing. The Lightstreamer reference client renders
  // the same field as "209/19:39:25", which is the decomposition reproduced here.
  const clock = symbol({ pui: 'TIME_000001', units: 'MS' })

  it('renders milliseconds-into-year as a day and a time', () => {
    // 209.8446 days = day 209 at 20:16:15 UTC.
    const result = formatValue(clock, String(209.844618 * 86_400_000))

    expect(result.text).toMatch(/^Day 209 · \d{2}:\d{2}:\d{2}$/)
    expect(result.unit).toBe('GMT')
  })

  it('places midnight at the start of a day', () => {
    expect(formatValue(clock, String(210 * 86_400_000)).text).toBe('Day 210 · 00:00:00')
  })

  it('pads hours, minutes and seconds', () => {
    // Day 5 at 01:02:03.
    const ms = (5 + (1 * 3600 + 2 * 60 + 3) / 86_400) * 86_400_000
    expect(formatValue(clock, String(ms)).text).toBe('Day 5 · 01:02:03')
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
