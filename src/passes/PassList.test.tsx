// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PassList } from './PassList.tsx'
import type { Pass, SkyPoint } from './findPasses.ts'
import type { Place } from './place.ts'

afterEach(cleanup)

const at = (iso: string, azimuth: number, elevation: number, visible: boolean): SkyPoint => ({
  date: new Date(iso),
  azimuth,
  elevation,
  visible,
})

const paris: Place = {
  kind: 'city',
  city: {
    slug: 'paris-fr',
    name: 'Paris',
    key: 'paris',
    country: 'FR',
    latitude: 48.85,
    longitude: 2.35,
    timeZone: 'Europe/Paris',
    population: 2138551,
  },
}

describe('PassList', () => {
  it('dates a pass by when it can be seen, not by when it rose', () => {
    // Rising at 23:59:40 and seen from 00:00:30, it read "Today · 00:00 → 00:05": the times of
    // one night under the name of the day before.
    const pass: Pass = {
      rise: at('2026-09-22T21:59:40Z', 280, 0, false),
      culmination: at('2026-09-22T22:02:40Z', 200, 50, true),
      set: at('2026-09-22T22:06:00Z', 110, 0, false),
      visible: {
        start: at('2026-09-22T22:00:30Z', 275, 11, true),
        peak: at('2026-09-22T22:02:40Z', 200, 50, true),
        end: at('2026-09-22T22:05:10Z', 115, 11, true),
        magnitude: -2.8,
        startsLate: false,
        endsInShadow: false,
      },
      reason: null,
      track: [],
    }
    render(<PassList passes={[pass]} place={paris} now={Date.parse('2026-09-22T18:00:00Z')} />)
    expect(screen.getByText('Tomorrow · 00:00 → 00:05')).toBeTruthy()
  })

  it('says plainly when nothing comes over at all', () => {
    // With no pass in the window the summary read "None of the next 0 passes can be seen from
    // Paris, France: ." — a count of nothing and a colon before an empty list.
    render(<PassList passes={[]} place={paris} now={Date.parse('2026-09-22T18:00:00Z')} />)
    expect(screen.getByText('The station does not come over Paris, France in the next five days.')).toBeTruthy()
  })
})
