import { describe, expect, it } from 'vitest'
import { normalise, packetKey } from './normalise.ts'

// Review focus 4
describe('normalise', () => {
  it('folds accents, case, punctuation and runs of space', () => {
    expect(normalise('  Saint-Étienne ')).toBe('saint etienne')
    expect(normalise("L'Haÿ-les-Roses")).toBe('l hay les roses')
    expect(normalise('SÃO PAULO')).toBe('sao paulo')
  })

  it('handles the letters decomposition does not reach', () => {
    expect(normalise('Łódź')).toBe('lodz')
    expect(normalise('Straße')).toBe('strasse')
    expect(normalise('Tromsø')).toBe('tromso')
    expect(normalise('Æbeltoft')).toBe('aebeltoft')
  })

  it('files a name under its first letter, and anything else under _', () => {
    expect(packetKey('Évry')).toBe('e')
    expect(packetKey('6th of October City')).toBe('_')
    expect(packetKey('')).toBe('_')
  })
})
