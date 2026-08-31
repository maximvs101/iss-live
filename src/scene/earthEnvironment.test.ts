/**
 * The Earth-as-a-light-source, checked against the integral it is supposed to be.
 *
 * The image is one flat colour and one edge, so there is very little to get wrong about its
 * appearance and exactly one thing to get wrong about its *strength*: whether the cap it draws
 * carries the light the directional lamp it replaced used to carry. That is a closed form —
 * E = L π sin²θ — and it is checked here by integrating the pixels the other way round, over the
 * solid angle each row actually subtends. Two routes to one number, which is the arrangement the
 * rest of this project settled on after being bitten by a second copy of an arithmetic.
 */
import { describe, expect, it } from 'vitest'
import {
  EARTH_CAP,
  capIrradiance,
  earthEnvironment,
  earthshineIntensity,
  environmentIntensity,
  rowCoverage,
} from './earthEnvironment'

describe('the Earth cap', () => {
  it('is the horizon the rest of the scene draws', () => {
    // 69.7437° is the figure verify:render holds against a calculation in kilometres.
    expect((EARTH_CAP * 180) / Math.PI).toBeCloseTo(69.7437, 3)
  })

  it('fills the third of the sky the geometry says it does', () => {
    const solidAngle = 2 * Math.PI * (1 - Math.cos(EARTH_CAP))
    expect(solidAngle / (4 * Math.PI)).toBeCloseTo(0.327, 3)
  })
})

describe('the conversion between a lamp and a cap', () => {
  it('spreads the lamp over the cap rather than repeating it', () => {
    // A cap of radiance L delivers L·π·sin²θ, so replacing a lamp of intensity I needs
    // L = I / (π sin²θ) — a third of the lamp's number, over a third of the sky.
    expect(capIrradiance(EARTH_CAP)).toBeCloseTo(2.765, 3)
    expect(environmentIntensity(0) * capIrradiance(EARTH_CAP)).toBeCloseTo(earthshineIntensity(0), 10)
    expect(environmentIntensity(1) * capIrradiance(EARTH_CAP)).toBeCloseTo(earthshineIntensity(1), 10)
  })

  it('keeps the law the light it replaces was given, eclipse included', () => {
    // Not physics, and deliberately so: in shadow this is the only light left on the station.
    expect(earthshineIntensity(0)).toBeCloseTo(0.38, 10)
    expect(earthshineIntensity(1)).toBeCloseTo(0.93, 10)
    expect(earthshineIntensity(1)).toBeGreaterThan(earthshineIntensity(0))
  })

  it('a full sphere of unit radiance is worth π, which is the sanity check on the formula', () => {
    expect(capIrradiance(Math.PI / 2)).toBeCloseTo(Math.PI, 10)
  })
})

describe('the image', () => {
  it('puts the planet below and nothing above', () => {
    const height = 64
    const texture = earthEnvironment(height)
    const width = height * 2
    const data = texture.image.data as Uint8Array

    const rowAt = (row: number) => {
      const at = row * width * 4
      return [data[at], data[at + 1], data[at + 2], data[at + 3]]
    }

    // Row 0 is v = 0, which the equirectangular sampler reads as straight down.
    expect(rowAt(0)).toEqual([0x6f, 0x93, 0xc4, 255])
    // The top row is the zenith, and there is nothing up there.
    expect(rowAt(height - 1)).toEqual([0, 0, 0, 255])
    expect(texture.image.width).toBe(width)
    expect(data.length).toBe(width * height * 4)
  })

  it('crosses from planet to sky at the horizon and nowhere else', () => {
    const height = 64
    const boundary = Math.floor((EARTH_CAP / Math.PI) * height)

    for (let row = 0; row < boundary; row += 1) expect(rowCoverage(row, height)).toBe(1)
    for (let row = boundary + 1; row < height; row += 1) expect(rowCoverage(row, height)).toBe(0)

    const edge = rowCoverage(boundary, height)
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(1)
  })

  /**
   * The one that matters: the flux, integrated over the pixels, against the closed form.
   *
   * Each row of an equirectangular image subtends `2π sin(θ) dθ` of sky, so summing coverage
   * weighted by `cos θ · sin θ` reproduces the cosine-weighted integral the closed form solves.
   * A hard step at the nearest row boundary would land 1–2 % out at this height and drift with the
   * resolution; the partial row is what removes both.
   */
  it('carries the flux the closed form says it does, at any resolution', () => {
    for (const height of [16, 64, 256]) {
      let integral = 0
      for (let row = 0; row < height; row += 1) {
        const lower = (row / height) * Math.PI
        const upper = ((row + 1) / height) * Math.PI
        const middle = (lower + upper) / 2
        // 2π sinθ dθ of sky, times cosθ for the surface facing the middle of the cap.
        integral += rowCoverage(row, height) * 2 * Math.PI * Math.sin(middle) * Math.cos(middle) * (upper - lower)
      }
      expect(integral).toBeCloseTo(capIrradiance(EARTH_CAP), 2)
    }
  })
})
