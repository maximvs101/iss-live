// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HomeMap } from './HomeMap.tsx'

afterEach(cleanup)
const NOW = Date.parse('2026-09-23T12:00:00Z')
const at = (minutes: number, longitude: number, latitude: number) => ({
  date: new Date(NOW + minutes * 60_000),
  longitude,
  latitude,
})

describe('HomeMap', () => {
  it('draws the track behind and ahead, split at the antimeridian, and the station', () => {
    const { container } = render(
      <HomeMap
        track={[at(-10, 170, 0), at(-5, 178, 5), at(0, -178, 10), at(5, -170, 15)]}
        position={{ latitude: 10, longitude: -178 }}
        label="Over the Pacific Ocean, 418 km up."
        now={NOW}
      />,
    )
    expect(screen.getByRole('img', { name: 'Over the Pacific Ocean, 418 km up.' })).toBeTruthy()
    expect(container.querySelectorAll('.home-map__past').length).toBe(1)
    expect(container.querySelectorAll('.home-map__ahead').length).toBe(1)
    const dot = container.querySelector('.home-map__station')!
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(2, 5)
    expect(Number(dot.getAttribute('cy'))).toBeCloseTo(80, 5)
  })

  it('joins the track to the station, with no gap on either side', () => {
    // The track is sampled on whole minutes: behind ended at the last one, ahead began at the next,
    // and up to four degrees of longitude either side of the dot were left undrawn.
    const { container } = render(
      <HomeMap
        track={[at(-2, 10, 0), at(-1, 14, 3), at(1, 22, 9), at(2, 26, 12)]}
        position={{ latitude: 6, longitude: 18 }}
        label="x"
        now={NOW}
      />,
    )
    const station = 'L198.0 84.0'
    expect(container.querySelector('.home-map__past')!.getAttribute('d')!.endsWith(station)).toBe(true)
    expect(container.querySelector('.home-map__ahead')!.getAttribute('d')!.startsWith('M198.0 84.0')).toBe(true)
  })
})
