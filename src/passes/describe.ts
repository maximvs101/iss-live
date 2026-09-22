/**
 * A pass in a sentence someone can act on standing in a garden.
 *
 * Degrees and azimuths are for the chart; out there, "look west, low" is what gets the station
 * found. The sentence describes the visible part only — the rest of the pass exists, but nobody
 * will see it.
 */
import type { Pass } from './findPasses.ts'
import { compass, compassWords, heightWords } from './sky.ts'
import { formatTime } from './time.ts'

const SHADOW = 'the Earth’s shadow'

export function describePass(pass: Pass, timeZone: string): string {
  const v = pass.visible
  if (!v) return ''
  const t = (d: Date) => formatTime(d, timeZone)
  const opening =
    `Look ${compassWords(v.start.azimuth)}, ${heightWords(v.start.elevation)}, at ${t(v.start.date)}` +
    (v.startsLate ? `: it appears there out of ${SHADOW}.` : '.')
  const middle =
    v.peak.elevation < 20
      ? ` It stays low, highest in the ${compassWords(v.peak.azimuth)} at ${t(v.peak.date)},`
      : ` It climbs ${heightWords(v.peak.elevation)} in the ${compassWords(v.peak.azimuth)} at ${t(v.peak.date)},`
  const closing = v.endsInShadow
    ? ` and fades into ${SHADOW} in the ${compassWords(v.end.azimuth)} at ${t(v.end.date)}.`
    : ` and drops low in the ${compassWords(v.end.azimuth)} at ${t(v.end.date)}.`
  return opening + middle + closing
}

export function summarise(pass: Pass): string {
  const v = pass.visible
  if (!v) return ''
  return `${compass(v.start.azimuth)} → ${Math.round(v.peak.elevation)}° ${compass(v.peak.azimuth)} → ${compass(v.end.azimuth)}`
}

export function reasonText(pass: Pass): string {
  switch (pass.reason) {
    case 'daylight':
      return 'daylight'
    case 'shadow':
      return `in ${SHADOW}`
    case 'low':
      return `too low, ${Math.round(pass.culmination.elevation)}°`
    default:
      return ''
  }
}
