/**
 * Tests for the Sun's direction in the station's own frame.
 *
 * This drives the lighting of the 3D twin, and a wrong sign there produces a scene that looks
 * entirely plausible while lighting the station from the wrong side — the kind of error nobody
 * catches by looking. So it is checked against a quantity computed by a different route: the beta
 * angle, which is the Sun's elevation above the orbital plane.
 */
import { describe, expect, it } from 'vitest'
import { twoline2satrec } from 'satellite.js'
import { betaAngle, propagateIss, sunDirectionLvlh } from './propagator'

// Real elements for the ISS, from Celestrak on 28/07/2026.
const satrec = twoline2satrec(
  '1 25544U 98067A   26209.15252568  .00010831  00000+0  20282-3 0  9992',
  '2 25544  51.6320  97.3682 0007093 345.6120  14.4666 15.49220842578109',
)

/** Samples spread across an orbit, so the checks are not accidents of one geometry. */
const SAMPLES = Array.from(
  { length: 12 },
  (_, i) => new Date(Date.UTC(2026, 6, 28, 6, i * 8)),
)

describe('sunDirectionLvlh', () => {
  it('is a unit vector', () => {
    for (const date of SAMPLES) {
      const state = propagateIss(satrec, date)!
      const [x, y, z] = sunDirectionLvlh(state, date)
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9)
    }
  })

  it('agrees with the beta angle about where the Sun sits out of plane', () => {
    // The independent check. Starboard is the negative of the orbital angular momentum direction,
    // so the Sun's starboard component is exactly −sin(beta). Beta is computed from the orbit
    // normal and the solar vector without ever going through this function.
    for (const date of SAMPLES) {
      const state = propagateIss(satrec, date)!
      const [starboard] = sunDirectionLvlh(state, date)
      const beta = (betaAngle(state, date) * Math.PI) / 180
      expect(starboard).toBeCloseTo(-Math.sin(beta), 6)
    }
  })

  it('puts the Sun above the horizon while the station is lit', () => {
    // Not a tautology: `shadow` comes from satellite.js's own eclipse model, and this vector from
    // our frame construction. A sunlit station with the Sun below its local horizon would mean one
    // of the two is wrong.
    for (const date of SAMPLES) {
      const state = propagateIss(satrec, date)!
      if (state.shadow > 0.5) continue
      const [, zenith] = sunDirectionLvlh(state, date)
      // At 420 km the horizon dips about 20° below local level, so the bound is generous.
      expect(zenith).toBeGreaterThan(-0.36)
    }
  })

  it('sweeps through the frame over one orbit rather than sitting still', () => {
    // The whole point of computing it: the Sun must travel round the station once per revolution.
    const along = SAMPLES.map((date) => sunDirectionLvlh(propagateIss(satrec, date)!, date)[2])
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(1.5)
  })

  it('keeps the out-of-plane component nearly fixed over one orbit', () => {
    // Beta changes by a degree or so a day, not within an orbit; the in-plane angle is what moves.
    const starboard = SAMPLES.map((date) => sunDirectionLvlh(propagateIss(satrec, date)!, date)[0])
    expect(Math.max(...starboard) - Math.min(...starboard)).toBeLessThan(0.02)
  })
})
