/**
 * Tests for linking to a part of the station.
 *
 * The parsing side is the one that matters: this value arrives from the address bar, so it is
 * attacker-controlled in the ordinary sense that anybody can type anything into it, and it is
 * handed straight to a lookup that expects a real part.
 */
import { describe, expect, it } from 'vitest'
import { partFromSearch, searchForPart } from './deepLink'
import { PARTS } from '../scene/parts'

describe('partFromSearch', () => {
  it('reads a part that exists', () => {
    expect(partFromSearch('?part=cupola')).toBe('cupola')
    expect(partFromSearch('?part=truss-s0')).toBe('truss-s0')
  })

  it('refuses a name that is not a part', () => {
    // `PARTS[value]` would otherwise hand `undefined` to a component with every right to a part.
    for (const search of ['?part=moon', '?part=__proto__', '?part=constructor', '?part=']) {
      expect(partFromSearch(search)).toBeNull()
    }
  })

  it('returns null when there is no parameter at all', () => {
    expect(partFromSearch('')).toBeNull()
    expect(partFromSearch('?view=map')).toBeNull()
  })

  it('accepts every part the application knows', () => {
    // A part renamed in the inventory without the link being updated would 404 silently.
    for (const part of Object.keys(PARTS)) {
      expect(partFromSearch(`?part=${encodeURIComponent(part)}`)).toBe(part)
    }
  })

  it('finds the parameter among others', () => {
    expect(partFromSearch('?utm_source=x&part=zvezda&y=1')).toBe('zvezda')
  })
})

describe('searchForPart', () => {
  it('writes the selection', () => {
    expect(searchForPart('cupola', '')).toBe('?part=cupola')
  })

  it('clears the parameter when nothing is selected', () => {
    expect(searchForPart(null, '?part=cupola')).toBe('')
  })

  it('leaves the rest of the query alone', () => {
    // This application owns one parameter, not the URL.
    expect(searchForPart('zvezda', '?utm_source=newsletter')).toBe('?utm_source=newsletter&part=zvezda')
    expect(searchForPart(null, '?utm_source=newsletter&part=cupola')).toBe('?utm_source=newsletter')
  })

  it('replaces rather than appends', () => {
    expect(searchForPart('destiny', '?part=cupola')).toBe('?part=destiny')
  })

  it('round-trips through the parser', () => {
    for (const part of ['cupola', 'truss-p6', 'saw-4b'] as const) {
      expect(partFromSearch(searchForPart(part, ''))).toBe(part)
    }
  })
})
