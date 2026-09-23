import { describe, expect, it } from 'vitest'
import { NAV, navState } from './nav.ts'

describe('the site navigation', () => {
  it('has the five entries, in order', () => {
    expect(NAV.map((i) => i.href)).toEqual(['/console/', '/passes/', '/station/', '/telemetry/', '/about/'])
    expect(NAV.map((i) => i.label)).toEqual(['Console', 'When to see it', 'The station', 'Systems', 'How it works'])
  })

  it('marks the page itself, and the section a subsystem page belongs to', () => {
    expect(navState('/passes/', '/passes/')).toBe('page')
    expect(navState('/telemetry/', '/telemetry/')).toBe('page')
    expect(navState('/telemetry/power/', '/telemetry/')).toBe('true')
    expect(navState('/telemetry/power/', '/passes/')).toBeUndefined()
    expect(navState('/', '/console/')).toBeUndefined()
  })
})
