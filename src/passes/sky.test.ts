import { describe, expect, it } from 'vitest'
import { compass, compassWords, heightWords, project } from './sky.ts'

describe('project', () => {
  it('puts the zenith at the centre and the horizon on the rim', () => {
    const zenith = project(123, 90)
    expect(Math.hypot(zenith.x, zenith.y)).toBe(0)
    const rim = project(0, 0)
    expect(Math.hypot(rim.x, rim.y)).toBeCloseTo(1, 12)
  })

  it('draws the sky as seen lying on your back, head to the north: east on the left', () => {
    expect(project(0, 0).y).toBeCloseTo(-1, 12) // north up
    expect(project(90, 0).x).toBeCloseTo(-1, 12) // east LEFT
    expect(project(270, 0).x).toBeCloseTo(1, 12) // west right
    expect(project(180, 0).y).toBeCloseTo(1, 12) // south down
  })

  it('spaces elevation evenly: 30° is two-thirds of the way out', () => {
    const p = project(180, 30)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(2 / 3, 12)
  })

  it('clamps below the horizon to the rim', () => {
    const p = project(45, -3)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 12)
  })
})

describe('compass', () => {
  it('names sixteen points and wraps', () => {
    expect(compass(0)).toBe('N')
    expect(compass(11.2)).toBe('N')
    expect(compass(11.3)).toBe('NNE')
    expect(compass(202.5)).toBe('SSW')
    expect(compass(359)).toBe('N')
    expect(compass(-90)).toBe('W')
    expect(compassWords(202.5)).toBe('south-south-west')
    expect(compassWords(270)).toBe('west')
  })
})

describe('heightWords', () => {
  it('says how far up to look without degrees', () => {
    expect(heightWords(12)).toBe('low')
    expect(heightWords(34)).toBe('a third of the way up')
    expect(heightWords(45)).toBe('halfway up')
    expect(heightWords(67)).toBe('two-thirds of the way up')
    expect(heightWords(82)).toBe('almost overhead')
  })
})
