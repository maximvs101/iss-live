import { describe, expect, it } from 'vitest'
import { landPath } from './world-paths.mjs'

describe('landPath', () => {
  it('projects equirectangularly, as the console map does', () => {
    expect(landPath([[[-180, 90], [0, 0], [180, -90]]], 360, 180)).toBe('M0 0L180 90L360 180Z')
  })

  it('lifts the pen where a ring crosses the antimeridian', () => {
    const d = landPath([[[170, 0], [-170, 0], [-170, 10], [170, 10]]], 360, 180)
    expect(d).toBe('M350 90M10 90L10 80M350 80Z')
  })
})
