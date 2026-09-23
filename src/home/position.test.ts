import { describe, expect, it } from 'vitest'
import { motionLine, positionLine } from './position.ts'

const state = { latitude: -12.34, longitude: -25.11, altitude: 418.4, speed: 7.66, shadow: 0 }

describe('positionLine', () => {
  it('says where the station is in coordinates until the place has a name', () => {
    expect(positionLine(state, null)).toBe('Over 12.3° S, 25.1° W, 418 km up.')
  })

  it('names the place once it can', () => {
    expect(positionLine(state, 'the South Atlantic Ocean')).toBe('Over the South Atlantic Ocean, 418 km up.')
    expect(positionLine(state, 'France')).toBe('Over France, 418 km up.')
  })
})

describe('motionLine', () => {
  it('gives the speed and whether the station is lit', () => {
    expect(motionLine(state)).toBe('27,576 km/h · in sunlight')
    expect(motionLine({ ...state, shadow: 1 })).toBe('27,576 km/h · in the Earth’s shadow')
  })
})
