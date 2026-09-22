/**
 * One pass as a calendar event, written in the browser.
 *
 * RFC 5545 is strict where calendars are not forgiving: CRLF line ends, lines folded at 75 octets
 * (bytes, not characters — an arrow is three), and commas, semicolons and newlines escaped. Times
 * are UTC; the calendar puts them in whatever zone its owner lives in. The uid is the place and the
 * minute, so adding the same pass twice replaces the first instead of doubling it.
 */
export interface CalendarPass {
  start: Date
  end: Date
  title: string
  location: string
  description: string
  uid: string
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function passUid(placeId: string, start: Date): string {
  return `${placeId}-${stamp(start).slice(0, 13)}Z@iss-live.pages.dev`
}

export function toIcs(pass: CalendarPass, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ISS Live//Passes//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${pass.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(pass.start)}`,
    `DTEND:${stamp(pass.end)}`,
    `SUMMARY:${escape(pass.title)}`,
    `LOCATION:${escape(pass.location)}`,
    `DESCRIPTION:${escape(pass.description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:ISS pass in 10 minutes',
    'TRIGGER:-PT10M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadIcs(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
