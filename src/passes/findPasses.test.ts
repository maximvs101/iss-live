import { describe, expect, it } from 'vitest'
import { twoline2satrec } from 'satellite.js'
import {
  DARK_SUN_DEGREES,
  MIN_ELEVATION_DEGREES,
  MIN_VISIBLE_SECONDS,
  findPasses,
  positionFrom,
  sampleAt,
  type Position,
} from './findPasses.ts'

/*
 * The fixture the orbit tests use: plausible elements with epoch 2026-07-28, beta about 69°, so
 * the station is sunlit almost all orbit — which is what makes late-July night passes visible.
 */
const satrec = twoline2satrec(
  '1 25544U 98067A   26209.15252568  .00016717  00000+0  30074-3 0  9993',
  '2 25544  51.6393 210.5107 0002140 106.5723 253.5556 15.50022337 12345',
)
const position = positionFrom(satrec)
const PARIS = { latitude: 48.86, longitude: 2.35 }
const TROMSO = { latitude: 69.65, longitude: 18.96 }
const FROM = new Date('2026-07-28T00:00:00Z')
const passes = findPasses(position, PARIS, FROM, 5)

describe('findPasses', () => {
  it('finds a plausible number of passes, in order, each rising, peaking and setting', () => {
    // At 49° N under a 51.6° orbit: four to seven passes a day.
    expect(passes.length).toBeGreaterThanOrEqual(15)
    expect(passes.length).toBeLessThanOrEqual(35)
    for (let i = 0; i < passes.length; i++) {
      const p = passes[i]
      expect(p.rise.date.getTime()).toBeLessThan(p.culmination.date.getTime())
      expect(p.culmination.date.getTime()).toBeLessThan(p.set.date.getTime())
      expect(p.set.date.getTime() - p.rise.date.getTime()).toBeLessThan(12 * 60_000)
      if (i > 0) expect(passes[i - 1].set.date.getTime()).toBeLessThan(p.rise.date.getTime())
    }
  })

  it('places rise and set on the horizon, and the culmination above every other point', () => {
    for (const p of passes) {
      expect(Math.abs(p.rise.elevation)).toBeLessThan(0.1)
      expect(Math.abs(p.set.elevation)).toBeLessThan(0.1)
      for (const point of p.track) expect(point.elevation).toBeLessThanOrEqual(p.culmination.elevation + 1e-6)
    }
  })

  it('calls a pass visible only where the station is high, lit, and the sky dark', () => {
    const visible = passes.filter((p) => p.visible)
    expect(visible.length).toBeGreaterThan(0)
    for (const p of visible) {
      const peak = sampleAt(position, PARIS, p.visible!.peak.date)!
      expect(peak.elevation).toBeGreaterThanOrEqual(MIN_ELEVATION_DEGREES - 0.01)
      expect(peak.sunElevation).toBeLessThanOrEqual(DARK_SUN_DEGREES + 0.01)
      expect(peak.sunlit).toBe(true)
      expect(p.reason).toBeNull()
      expect(p.visible!.start.date.getTime()).toBeLessThanOrEqual(p.visible!.end.date.getTime())
    }
  })

  it('gives every invisible pass the reason that rules it out', () => {
    for (const p of passes.filter((x) => !x.visible)) {
      const high = p.track.filter((s) => s.elevation >= MIN_ELEVATION_DEGREES)
      if (p.reason === 'low') expect(high).toHaveLength(0)
      if (p.reason === 'daylight') {
        for (const s of high) expect(sampleAt(position, PARIS, s.date)!.sunElevation).toBeGreaterThan(DARK_SUN_DEGREES)
      }
      if (p.reason === 'shadow') {
        const dark = high.map((s) => sampleAt(position, PARIS, s.date)!).filter((s) => s.sunElevation <= DARK_SUN_DEGREES)
        expect(dark.length).toBeGreaterThan(0)
        for (const s of dark) expect(s.sunlit).toBe(false)
      }
    }
  })

  it('calls nothing visible that is seen for less than a minute', () => {
    // Over Paris one evening the finder offered a pass visible for seconds, at 10° exactly and
    // faint, before the shadow took it: true by the three conditions, and a walk outside for nothing.
    expect(MIN_VISIBLE_SECONDS).toBe(60)
    for (const p of passes.filter((x) => x.visible)) {
      expect(p.visible!.end.date.getTime() - p.visible!.start.date.getTime()).toBeGreaterThanOrEqual(60_000)
    }
    const brief = findPasses(position, PARIS, FROM, 5).filter((p) => p.reason === 'brief')
    for (const p of brief) expect(p.track.some((s) => s.visible)).toBe(true)
  })

  // Review focus 1
  it('keeps a pass already in progress', () => {
    const first = passes[3]
    const again = findPasses(position, PARIS, first.culmination.date, 1)
    expect(Math.abs(again[0].rise.date.getTime() - first.rise.date.getTime())).toBeLessThan(1000)
  })

  // Review focus 2
  it('finds nothing visible under the midnight twilight of the far north', () => {
    const north = findPasses(position, TROMSO, FROM, 3)
    expect(north.length).toBeGreaterThan(0)
    for (const p of north) {
      expect(p.visible).toBeNull()
      expect(['daylight', 'low']).toContain(p.reason)
    }
  })

  it('carries on past a stretch the propagator cannot compute', () => {
    const gap: Position = (date) => {
      const t = date.getTime()
      return t > FROM.getTime() + 6 * 3_600_000 && t < FROM.getTime() + 8 * 3_600_000 ? null : position(date)
    }
    const holed = findPasses(gap, PARIS, FROM, 5)
    expect(holed.length).toBeGreaterThan(passes.length - 3)
  })
})
