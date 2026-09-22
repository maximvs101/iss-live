import { describe, expect, it } from 'vitest'
import { passUid, toIcs } from './ics.ts'

const event = {
  start: new Date('2026-09-22T18:14:05Z'),
  end: new Date('2026-09-22T18:20:40Z'),
  title: 'ISS pass — very bright',
  location: 'Paris, France',
  description:
    'Look west, low, at 20:14. It climbs two-thirds of the way up in the south-south-west at 20:17; check again on the day, a reboost can move it by minutes.\nhttps://iss-live.pages.dev/passes/?city=paris-fr',
  uid: passUid('paris-fr', new Date('2026-09-22T18:14:05Z')),
}
const text = toIcs(event, new Date('2026-09-20T08:00:00Z'))
const lines = text.split('\r\n')

describe('toIcs', () => {
  it('writes one event in UTC with a reminder ten minutes before', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('DTSTART:20260922T181405Z')
    expect(lines).toContain('DTEND:20260922T182040Z')
    expect(lines).toContain('DTSTAMP:20260920T080000Z')
    expect(lines).toContain('TRIGGER:-PT10M')
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('ends every line with CRLF and folds none longer than 75 bytes', () => {
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(lines.some((l) => l.startsWith(' '))).toBe(true)
  })

  it('escapes commas, semicolons and newlines', () => {
    const unfolded = text.replace(/\r\n /g, '')
    expect(unfolded).toContain('LOCATION:Paris\\, France')
    expect(unfolded).toContain('south-south-west at 20:17\\; check')
    expect(unfolded).toContain('by minutes.\\nhttps://')
  })

  it('keeps one uid per place and minute, so adding twice replaces', () => {
    expect(passUid('paris-fr', new Date('2026-09-22T18:14:05Z'))).toBe(
      passUid('paris-fr', new Date('2026-09-22T18:14:50Z')),
    )
    expect(passUid('paris-fr', new Date('2026-09-22T18:14:05Z'))).toBe('paris-fr-20260922T1814Z@iss-live.pages.dev')
  })

  it('never cuts a multi-byte character in two when folding', () => {
    const long = toIcs({ ...event, description: '→'.repeat(60) })
    const unfolded = long.replace(/\r\n /g, '')
    expect(unfolded).toContain(`DESCRIPTION:${'→'.repeat(60)}`)
  })
})
