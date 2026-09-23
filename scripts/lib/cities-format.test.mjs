import { describe, expect, it } from 'vitest'
import { assignSlugs, buildPackets, dropDistricts, isTown, parseGeonamesLine } from './cities-format.mjs'

const line = (id, name, ascii, lat, lon, cc, pop, tz, code = 'PPL') =>
  [id, name, ascii, '', lat, lon, 'P', code, cc, '', '', '', '', '', pop, '', '', tz, '2024-01-01'].join('\t')

describe('cities format', () => {
  it('reads the columns it needs from a GeoNames line', () => {
    expect(parseGeonamesLine(line('2988507', 'Paris', 'Paris', '48.85341', '2.3488', 'FR', '2138551', 'Europe/Paris', 'PPLC'))).toEqual({
      id: 2988507,
      name: 'Paris',
      ascii: 'Paris',
      latitude: 48.85341,
      longitude: 2.3488,
      country: 'FR',
      population: 2138551,
      timeZone: 'Europe/Paris',
      featureCode: 'PPLC',
    })
  })

  it('keeps towns and leaves out the districts GeoNames files beside them', () => {
    // "Paris 15 Vaugirard" came up under "par", beside Paris: a district is where a city is, not
    // another city, and 817 of them sit above the population floor.
    const parsed = (code) => parseGeonamesLine(line('1', 'X', 'X', '0', '0', 'FR', '60000', 'Europe/Paris', code))
    expect(isTown(parsed('PPLC'))).toBe(true)
    expect(isTown(parsed('PPLA2'))).toBe(true)
    expect(isTown(parsed('PPLX'))).toBe(false)
    expect(isTown(parsed('PPLH'))).toBe(false)
  })

  it('also leaves out the numbered districts GeoNames codes as towns', () => {
    // Paris's arrondissements are coded PPL like any town, Marseille's PPLA5: what gives them away
    // is a name that is another town's name in the same country, followed by a number.
    const city = (id, name, country = 'FR') => ({ id, name, ascii: name, country, population: 100000 })
    const kept = dropDistricts([
      city(1, 'Paris'),
      city(2, 'Paris 15 Vaugirard'),
      city(3, 'Marseille'),
      city(4, 'Marseille 08'),
      city(5, 'Paris 15', 'US'), // no Paris in that country here: a name, not a district
      city(6, '6th of October City', 'EG'),
    ])
    expect(kept.map((c) => c.id)).toEqual([1, 3, 5, 6])
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

  it('keys a city on its own name, not on the ASCII spelling GeoNames gives it', () => {
    // GeoNames' ASCII column writes ü as "ue" and Đ as "Gj": typed "Zürich" or "Zurich" found nothing,
    // only "Zuer…", and 105 cities could not be found by their own name.
    const cities = [
      { id: 1, name: 'Zürich', ascii: 'Zuerich', latitude: 47.37, longitude: 8.55, country: 'CH', population: 341730, timeZone: 'Europe/Zurich' },
      { id: 2, name: 'Đồng Hới', ascii: 'Gjong Hoi', latitude: 17.47, longitude: 106.6, country: 'VN', population: 60000, timeZone: 'Asia/Ho_Chi_Minh' },
      { id: 3, name: 'ⴰⵎⵙⵎⵔⵔⵉ', ascii: 'Amsmrri', latitude: 30, longitude: -9, country: 'MA', population: 60000, timeZone: 'Africa/Casablanca' },
    ]
    const packets = buildPackets(cities)
    expect(packets.get('z').rows[0].slice(0, 3)).toEqual(['zurich-ch', 'Zürich', 'zurich'])
    expect(packets.get('d').rows[0].slice(0, 3)).toEqual(['dong-hoi-vn', 'Đồng Hới', 'dong hoi'])
    // A name with no Latin letters at all falls back to the ASCII spelling rather than to nothing.
    expect(packets.get('a').rows[0].slice(0, 3)).toEqual(['amsmrri-ma', 'ⴰⵎⵙⵎⵔⵔⵉ', 'amsmrri'])
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
