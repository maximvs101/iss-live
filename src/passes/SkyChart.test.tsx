// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SkyChart } from './SkyChart.tsx'
import type { Pass, SkyPoint } from './findPasses.ts'

afterEach(cleanup)

const at = (iso: string, azimuth: number, elevation: number, visible: boolean): SkyPoint => ({
  date: new Date(iso),
  azimuth,
  elevation,
  visible,
})
const pass: Pass = {
  rise: at('2026-09-22T18:13:00Z', 270, 0, false),
  culmination: at('2026-09-22T18:17:00Z', 180, 67, true),
  set: at('2026-09-22T18:21:00Z', 90, 0, false),
  visible: {
    start: at('2026-09-22T18:14:00Z', 265, 11, true),
    peak: at('2026-09-22T18:17:00Z', 180, 67, true),
    end: at('2026-09-22T18:20:00Z', 95, 11, true),
    magnitude: -3.1,
    startsLate: false,
    endsInShadow: false,
  },
  reason: null,
  track: [
    at('2026-09-22T18:13:00Z', 270, 0, false),
    at('2026-09-22T18:17:00Z', 180, 67, true),
    at('2026-09-22T18:21:00Z', 90, 0, false),
  ],
}

describe('SkyChart', () => {
  it('labels east on the left and west on the right', () => {
    const { container } = render(<SkyChart id="c" pass={pass} timeZone="Europe/Paris" />)
    const x = (label: string) =>
      Number([...container.querySelectorAll('text')].find((t) => t.textContent === label)!.getAttribute('x'))
    expect(x('E')).toBeLessThan(0)
    expect(x('W')).toBeGreaterThan(0)
  })

  it('describes itself in words, with the magnitude and its uncertainty', () => {
    render(<SkyChart id="c" pass={pass} timeZone="Europe/Paris" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Look west, low, at 20:14')
    expect(screen.getByText(/≈ −3\.1 magnitude, give or take one/)).toBeTruthy()
  })
})
