/**
 * Every pass of the station over one place, and whether it can be seen.
 *
 * Sampled every 30 seconds rather than solved: a pass lasts minutes, so no pass can hide between
 * two samples, and the crossings are then refined by bisection to half a second. The same
 * satellite.js the rest of the site propagates with, so the page and the map agree; the answer is
 * checked against an independent implementation by `npm run verify:passes`.
 */
import {
  ecfToLookAngles,
  eciToEcf,
  geodeticToEcf,
  gstime,
  jday,
  propagate,
  shadowFraction,
  sunPos,
  type EciVec3,
  type SatRec,
} from 'satellite.js'
import { magnitude } from './brightness.ts'

export const STEP_SECONDS = 30
export const TRACK_STEP_SECONDS = 10
export const DARK_SUN_DEGREES = -6
export const MIN_ELEVATION_DEGREES = 10
export const LOOKBACK_MINUTES = 15
/*
 * Shorter than this, a pass is not called visible. The three conditions alone offered, over Paris,
 * a pass seen for seconds at exactly 10° and faint, before the shadow took it — true, and a walk
 * outside for nothing. A minute is what it takes to find a moving point and know it is the station.
 */
export const MIN_VISIBLE_SECONDS = 60

const AU_KM = 149_597_870.7
const DEG = 180 / Math.PI

export interface Observer {
  latitude: number
  longitude: number
  heightKm?: number
}
export type Position = (date: Date) => EciVec3<number> | null
export interface Sample {
  date: Date
  azimuth: number
  elevation: number
  rangeKm: number
  sunElevation: number
  sunlit: boolean
  phaseAngle: number
}
export interface SkyPoint {
  date: Date
  azimuth: number
  elevation: number
  visible: boolean
}
export interface VisiblePart {
  start: SkyPoint
  peak: SkyPoint
  end: SkyPoint
  magnitude: number
  /** It comes out of the Earth's shadow already high: look for it there, not at the horizon. */
  startsLate: boolean
  endsInShadow: boolean
}
export type Reason = 'daylight' | 'shadow' | 'low' | 'brief'
export interface Pass {
  rise: SkyPoint
  culmination: SkyPoint
  set: SkyPoint
  visible: VisiblePart | null
  reason: Reason | null
  track: SkyPoint[]
}

export function positionFrom(satrec: SatRec): Position {
  return (date) => {
    try {
      const result = propagate(satrec, date)
      return result?.position ? result.position : null
    } catch {
      return null
    }
  }
}

const sub = (a: EciVec3<number>, b: EciVec3<number>) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: EciVec3<number>, b: EciVec3<number>) => a.x * b.x + a.y * b.y + a.z * b.z
const angle = (a: EciVec3<number>, b: EciVec3<number>) =>
  Math.acos(Math.min(1, Math.max(-1, dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b)))))

export function sampleAt(position: Position, observer: Observer, date: Date): Sample | null {
  const eci = position(date)
  if (!eci) return null
  const gmst = gstime(date)
  const site = {
    latitude: observer.latitude / DEG,
    longitude: observer.longitude / DEG,
    height: observer.heightKm ?? 0,
  }
  const station = eciToEcf(eci, gmst)
  const look = ecfToLookAngles(site, station)
  const sunAu = sunPos(jday(date)).rsun
  const sun = eciToEcf({ x: sunAu.x * AU_KM, y: sunAu.y * AU_KM, z: sunAu.z * AU_KM }, gmst)
  const sunLook = ecfToLookAngles(site, sun)
  const ground = geodeticToEcf(site)
  return {
    date,
    azimuth: look.azimuth * DEG,
    elevation: look.elevation * DEG,
    rangeKm: look.rangeSat,
    sunElevation: sunLook.elevation * DEG,
    sunlit: shadowFraction(sunAu, eci) < 0.5,
    // Sun–station–observer: 0° is the station fully lit as we see it.
    phaseAngle: angle(sub(ground, station), sub(sun, station)) * DEG,
  }
}

const isVisible = (s: Sample) =>
  s.elevation >= MIN_ELEVATION_DEGREES && s.sunElevation <= DARK_SUN_DEGREES && s.sunlit
const toPoint = (s: Sample): SkyPoint => ({
  date: s.date,
  azimuth: s.azimuth,
  elevation: s.elevation,
  visible: isVisible(s),
})

/** The first instant in (a, b] where `becomes` holds, given it does not at a and does at b. */
function refine(
  position: Position,
  observer: Observer,
  a: Sample,
  b: Sample,
  becomes: (s: Sample) => boolean,
): Sample {
  let lo = a.date.getTime()
  let hi = b.date.getTime()
  let found = b
  while (hi - lo > 500) {
    const mid = (lo + hi) / 2
    const s = sampleAt(position, observer, new Date(mid))
    if (s && becomes(s)) {
      hi = mid
      found = s
    } else lo = mid
  }
  return found
}

/** Highest point near a sampled maximum, by ternary search over one track step either side. */
function culminate(position: Position, observer: Observer, around: Sample): Sample {
  let lo = around.date.getTime() - TRACK_STEP_SECONDS * 1000
  let hi = around.date.getTime() + TRACK_STEP_SECONDS * 1000
  let best = around
  for (let i = 0; i < 30; i++) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    const s1 = sampleAt(position, observer, new Date(m1))
    const s2 = sampleAt(position, observer, new Date(m2))
    if (!s1 || !s2) break
    if (s1.elevation < s2.elevation) lo = m1
    else hi = m2
    const better = s1.elevation > s2.elevation ? s1 : s2
    if (better.elevation > best.elevation) best = better
  }
  return best
}

function buildPass(position: Position, observer: Observer, rise: Sample, set: Sample): Pass {
  const samples: Sample[] = [rise]
  for (
    let t = rise.date.getTime() + TRACK_STEP_SECONDS * 1000;
    t < set.date.getTime();
    t += TRACK_STEP_SECONDS * 1000
  ) {
    const s = sampleAt(position, observer, new Date(t))
    if (s) samples.push(s)
  }
  samples.push(set)

  const highest = samples.reduce((a, b) => (b.elevation > a.elevation ? b : a))
  const culmination = culminate(position, observer, highest)

  const first = samples.findIndex(isVisible)
  let visible: VisiblePart | null = null
  let reason: Reason | null = null

  if (first === -1) {
    const high = samples.filter((s) => s.elevation >= MIN_ELEVATION_DEGREES)
    if (high.length === 0) reason = 'low'
    else if (high.every((s) => s.sunElevation > DARK_SUN_DEGREES)) reason = 'daylight'
    else reason = 'shadow'
  } else {
    /*
     * One unbroken stretch, the longest. At high beta the shadow lasts minutes and a pass can be
     * seen, lost and seen again; measured from the first glimpse to the last, two ten-second
     * glimpses 4.5 minutes apart passed the one-minute rule and the sentence sent people to look
     * through the gap. The minute is counted on one stretch, and only that stretch is described.
     */
    let best: { first: number; last: number; start: Sample; end: Sample } | null = null
    for (let i = first; i < samples.length; i++) {
      if (!isVisible(samples[i]) || (i > 0 && isVisible(samples[i - 1]))) continue
      let j = i
      while (j + 1 < samples.length && isVisible(samples[j + 1])) j++
      const start = i > 0 ? refine(position, observer, samples[i - 1], samples[i], isVisible) : samples[i]
      const end =
        j < samples.length - 1 ? refine(position, observer, samples[j], samples[j + 1], (s) => !isVisible(s)) : samples[j]
      const length = end.date.getTime() - start.date.getTime()
      if (!best || length > best.end.date.getTime() - best.start.date.getTime()) best = { first: i, last: j, start, end }
    }
    const { first: from, last, start, end } = best!
    const inside = samples.slice(from, last + 1)
    if (isVisible(culmination) && culmination.date >= start.date && culmination.date <= end.date) {
      inside.push(culmination)
    }
    const peak = inside.reduce((a, b) => (b.elevation > a.elevation ? b : a))
    const before = from > 0 ? samples[from - 1] : null
    const after = last < samples.length - 1 ? samples[last + 1] : null
    if (end.date.getTime() - start.date.getTime() < MIN_VISIBLE_SECONDS * 1000) {
      reason = 'brief'
    } else visible = {
      start: { ...toPoint(start), visible: true },
      peak: toPoint(peak),
      end: { ...toPoint(end), visible: true },
      magnitude: Math.min(...inside.map((s) => magnitude(s.rangeKm, s.phaseAngle))),
      startsLate: !!before && !before.sunlit && before.elevation >= MIN_ELEVATION_DEGREES,
      endsInShadow: !!after && !after.sunlit,
    }
  }

  return {
    rise: toPoint(rise),
    culmination: toPoint(culmination),
    set: toPoint(set),
    visible,
    reason,
    track: samples.map(toPoint),
  }
}

export function findPasses(position: Position, observer: Observer, from: Date, days = 5): Pass[] {
  // On absolute multiples of the step, not on "now": the bisections start from the grid, so a grid
  // that moved with the clock moved every instant found with it — by the milliseconds a timer
  // drifts, enough to re-key the whole list and close an open sky chart once a minute.
  const step = STEP_SECONDS * 1000
  const start = Math.floor((from.getTime() - LOOKBACK_MINUTES * 60_000) / step) * step
  const end = from.getTime() + days * 86_400_000
  const passes: Pass[] = []
  let previous = sampleAt(position, observer, new Date(start))
  let rise: Sample | null = null

  for (let t = start + STEP_SECONDS * 1000; t <= end; t += STEP_SECONDS * 1000) {
    const current = sampleAt(position, observer, new Date(t))
    if (!current || !previous) {
      // A hole in the propagation: whatever was rising is abandoned rather than guessed at.
      previous = current
      rise = null
      continue
    }
    if (previous.elevation < 0 && current.elevation >= 0) {
      rise = refine(position, observer, previous, current, (s) => s.elevation >= 0)
    } else if (rise && previous.elevation >= 0 && current.elevation < 0) {
      const set = refine(position, observer, previous, current, (s) => s.elevation < 0)
      if (set.date.getTime() >= from.getTime()) passes.push(buildPass(position, observer, rise, set))
      rise = null
    }
    previous = current
  }
  return passes
}
