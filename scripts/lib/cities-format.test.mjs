import { describe, expect, it } from 'vitest'
import { assignSlugs, buildPackets, parseGeonamesLine } from './cities-format.mjs'

const line = (id, name, ascii, lat, lon, cc, pop, tz) =>
  [id, name, ascii, '', lat, lon, 'P', 'PPL', cc, '', '', '', '', '', pop, '', '', tz, '2024-01-01'].join('\t')

describe('cities format', () => {
  it('reads the columns it needs from a GeoNames line', () => {
    expect(parseGeonamesLine(line('2988507', 'Paris', 'Paris', '48.85341', '2.3488', 'FR', '2138551', 'Europe/Paris'))).toEqual({
      id: 2988507,
      name: 'Paris',
      ascii: 'Paris',
      latitude: 48.85341,
      longitude: 2.3488,
      country: 'FR',
      population: 2138551,
      timeZone: 'Europe/Paris',
    })
  })

  it('gives the biggest namesake the plain slug and numbers the rest', () => {
    const cities = [
      { id: 2, name: 'Saint-Denis', ascii: 'Saint-Denis', country: 'FR', population: 110000 },
      { id: 1, name: 'Saint-Denis', ascii: 'Saint-Denis', country: 'RE', population: 150000 },
      { id: 3, name: 'Saint-Denis', ascii: 'Saint-Denis', country: 'FR', population: 20000 },
    ]
    const slugs = assignSlugs(cities)
    expect(slugs.get(2)).toBe('saint-denis-fr')
    expect(slugs.get(3)).toBe('saint-denis-fr-2')
    expect(slugs.get(1)).toBe('saint-denis-re')
  })

  it('packs by first letter, rounds to a kilometre, and indexes the zones', () => {
    const cities = [
      { id: 1, name: 'Lyon', ascii: 'Lyon', latitude: 45.74846, longitude: 4.84671, country: 'FR', population: 522969, timeZone: 'Europe/Paris' },
      { id: 2, name: 'Łódź', ascii: 'Lodz', latitude: 51.75, longitude: 19.46667, country: 'PL', population: 768755, timeZone: 'Europe/Warsaw' },
    ]
    const packets = buildPackets(cities)
    expect([...packets.keys()]).toEqual(['l'])
    const l = packets.get('l')
    expect(l.tz).toEqual(['Europe/Warsaw', 'Europe/Paris'])
    expect(l.rows).toEqual([
      ['lodz-pl', 'Łódź', 'lodz', 'PL', 51.75, 19.47, 0, 768755],
      ['lyon-fr', 'Lyon', 'lyon', 'FR', 45.75, 4.85, 1, 522969],
    ])
  })
})
