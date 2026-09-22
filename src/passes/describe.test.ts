import { describe, expect, it } from 'vitest'
import type { Pass, SkyPoint } from './findPasses.ts'
import { describePass, reasonText, summarise } from './describe.ts'

const at = (iso: string, azimuth: number, elevation: number, visible = true): SkyPoint => ({
  date: new Date(iso),
  azimuth,
  elevation,
  visible,
})

const pass: Pass = {
  rise: at('2026-09-22T18:13:00Z', 280, 0, false),
  culmination: at('2026-09-22T18:17:00Z', 202, 67),
  set: at('2026-09-22T18:21:00Z', 110, 0, false),
  visible: {
    start: at('2026-09-22T18:14:00Z', 272, 11),
    peak: at('2026-09-22T18:17:00Z', 202, 67),
    end: at('2026-09-22T18:20:00Z', 112, 11),
    magnitude: -3.1,
    startsLate: false,
    endsInShadow: false,
  },
  reason: null,
  track: [],
}

describe('describePass', () => {
  it('says where to look, how high, and when, in the local time', () => {
    expect(describePass(pass, 'Europe/Paris')).toBe(
      'Look west, low, at 20:14. It climbs two-thirds of the way up in the south-south-west at 20:17, and drops low in the east-south-east at 20:20.',
    )
  })

  it('says so when it comes out of the shadow already high, or fades into it', () => {
    const late: Pass = { ...pass, visible: { ...pass.visible!, startsLate: true, endsInShadow: true } }
    expect(describePass(late, 'Europe/Paris')).toBe(
      'Look west, low, at 20:14: it appears there out of the Earth’s shadow. It climbs two-thirds of the way up in the south-south-west at 20:17, and fades into the Earth’s shadow in the east-south-east at 20:20.',
    )
  })

  it('keeps a low pass low', () => {
    const low: Pass = { ...pass, visible: { ...pass.visible!, peak: at('2026-09-22T18:17:00Z', 202, 16) } }
    expect(describePass(low, 'Europe/Paris')).toContain('It stays low, highest in the south-south-west at 20:17')
  })
})

describe('summarise and reasonText', () => {
  it('summarises the visible part in compass points', () => {
    expect(summarise(pass)).toBe('W → 67° SSW → ESE')
  })

  it('gives the reason in words', () => {
    expect(reasonText({ ...pass, visible: null, reason: 'daylight' })).toBe('daylight')
    expect(reasonText({ ...pass, visible: null, reason: 'shadow' })).toBe('in the Earth’s shadow')
    expect(
      reasonText({ ...pass, visible: null, reason: 'low', culmination: at('2026-09-22T18:17:00Z', 330, 7.6) }),
    ).toBe('too low, 8°')
  })
})
