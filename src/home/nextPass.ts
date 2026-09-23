/**
 * The next pass worth going outside for, on the home page — for the place the visitor already
 * chose on /passes/, read from the same memory and held to the same rules. The home page never asks
 * for a position itself: that stays on /passes/, where the page explains what happens to it.
 */
import { elementsAgeHours, type OrbitalElements } from '../orbit/tle.ts'
import { brightnessOf } from '../passes/brightness.ts'
import type { Fetcher } from '../passes/cities.ts'
import { MAX_ELEMENTS_AGE_HOURS, findPasses, positionFrom, type Pass } from '../passes/findPasses.ts'
import { placeLabel, placeTimeZone, readStored, resolveChoice, type Place } from '../passes/place.ts'
import { formatDay, formatTime } from '../passes/time.ts'

export type NextPass =
  | { kind: 'pass'; place: Place; pass: Pass }
  | { kind: 'none'; place: Place }
  | { kind: 'ask' }
  | { kind: 'stale' }

export async function nextVisible(
  storage: Storage | null,
  elements: OrbitalElements,
  now: number,
  fetcher?: Fetcher,
): Promise<NextPass> {
  const stored = readStored(storage)
  if (!stored) return { kind: 'ask' }
  const place = await resolveChoice({ source: 'stored', stored }, fetcher).catch(() => null)
  if (!place) return { kind: 'ask' }
  if (elementsAgeHours(elements, now) > MAX_ELEMENTS_AGE_HOURS) return { kind: 'stale' }
  const observer = place.kind === 'city' ? place.city : place
  const pass = findPasses(positionFrom(elements.satrec), observer, new Date(now), 5).find(
    (p) => p.visible && p.visible.end.date.getTime() >= now,
  )
  return pass ? { kind: 'pass', place, pass } : { kind: 'none', place }
}

const where = (place: Place) => (place.kind === 'city' ? place.city.name : 'your location')

export function nextPassLine(next: NextPass, now: number): string {
  if (next.kind === 'ask') return 'When can you see it from your city?'
  if (next.kind === 'stale') return 'Pass times need fresher orbital elements than this page could fetch.'
  if (next.kind === 'none') return `No visible pass over ${placeLabel(next.place)} in the next five days.`
  const v = next.pass.visible!
  const zone = placeTimeZone(next.place)
  const day = formatDay(v.start.date, zone, new Date(now))
  const when = day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day
  return `Next visible from ${where(next.place)}: ${when} at ${formatTime(v.start.date, zone)} · ${brightnessOf(v.magnitude)}`
}
