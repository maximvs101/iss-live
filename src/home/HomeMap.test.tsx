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
})
