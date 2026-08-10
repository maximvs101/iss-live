/**
 * Pass finding, and the degenerate run that used to come out of it.
 *
 * The search walks time in fixed steps and calls a run of consecutive samples above the threshold a
 * pass. When only one sample lands above it, rise, culmination and set collapse onto the same
 * point, and what reached the interface was:
 *
 *     10 Aug, 12:37:24 → 10 Aug, 12:37:24   max 11°   ESE→ESE   0 min
 *
 * A duration of zero and a set bearing equal to the rise. Not a marginal pass reported honestly —
 * an event with no measured extent, because the search never looked between its ends. `verify:passes`
 * caught it on a live sky, by the one check that asks whether the two bearings differ.
 *
 * Reproducing it needs no particular sky, only a step coarse enough that a real pass falls through
 * the grid: at ten minutes a stride, a six-minute pass is seen once or not at all.
 */
import { describe, expect, it } from 'vitest'
import { twoline2satrec } from 'satellite.js'
import { findPasses } from './passes'

/** The elements the application falls back to, so this test needs no network and no fixture drift. */
const satrec = twoline2satrec(
  '1 25544U 98067A   26209.15252568  .00010831  00000+0  20282-3 0  9992',
  '2 25544  51.6320  97.3682 0007093 345.6120  14.4666 15.49220842578109',
)

const PARIS = { latitude: 48.8566, longitude: 2.3522, altitudeM: 35 }
const FROM = new Date('2026-08-09T12:00:00Z')

describe('finding passes', () => {
  it('finds passes over a location inside the orbit inclination', () => {
    const passes = findPasses(satrec, PARIS, FROM, { hours: 72, minElevation: 10 })
    // 51.6° of inclination against Paris at 48.9°: there is always something within three days.
    expect(passes.length).toBeGreaterThan(5)
  })

  it('never reports a pass whose rise and set are the same moment', () => {
    // A ten-minute stride against passes that last six: any run that survives is one sample long,
    // which is exactly the case that used to produce 0 min and ESE→ESE.
    const passes = findPasses(satrec, PARIS, FROM, {
      hours: 72,
      minElevation: 10,
      stepSeconds: 600,
    })

    for (const pass of passes) {
      expect(pass.end.date.getTime(), 'zero-length pass').toBeGreaterThan(pass.start.date.getTime())
    }
  })

  it('keeps rise, culmination and set in order and in the sky', () => {
    for (const pass of findPasses(satrec, PARIS, FROM, { hours: 72, minElevation: 10 })) {
      expect(pass.start.date.getTime()).toBeLessThanOrEqual(pass.culmination.date.getTime())
      expect(pass.culmination.date.getTime()).toBeLessThanOrEqual(pass.end.date.getTime())
      // The culmination is the highest point by construction; if it were not, the summary line
      // would quote an elevation the station never reached.
      expect(pass.culmination.elevation).toBeGreaterThanOrEqual(pass.start.elevation)
      expect(pass.culmination.elevation).toBeGreaterThanOrEqual(pass.end.elevation)
      expect(pass.culmination.elevation).toBeLessThanOrEqual(90)
    }
  })

  it('honours the minimum elevation it was given', () => {
    const high = findPasses(satrec, PARIS, FROM, { hours: 72, minElevation: 40 })
    const low = findPasses(satrec, PARIS, FROM, { hours: 72, minElevation: 10 })

    expect(high.length).toBeLessThan(low.length)
    for (const pass of high) expect(pass.culmination.elevation).toBeGreaterThanOrEqual(40)
  })

  it('returns nothing where the station never rises', () => {
    // The orbit reaches 51.6°; the pole is out of reach whatever the window.
    const pole = { latitude: 89, longitude: 0, altitudeM: 0 }
    expect(findPasses(satrec, pole, FROM, { hours: 72, minElevation: 10 })).toHaveLength(0)
  })
})
