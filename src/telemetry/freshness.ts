/**
 * How old every reading is, as one picture rather than 163 separate lines.
 *
 * The age is already stated beside each value, and that turned out not to be enough: a reader has
 * to walk six subsystem tabs to discover that Destiny's and Tranquility's partial pressures have
 * not produced a number since 11 August while the joint angles move every two seconds. The fact is
 * in the interface and invisible in it.
 *
 * Age is taken from the **station's own timestamp**, never from when the packet landed. The stream
 * re-sends whatever it likes whenever it likes: a sample can arrive a second ago and carry a
 * reading taken weeks earlier, which is precisely what the stalled sensors do. Timing from arrival
 * would paint the whole grid green over a station that has said nothing for a month.
 */
import { getSymbol } from '../data/catalog'
import { LIVE_THRESHOLD_MS } from './health'
import type { TelemetrySample } from './store'

/**
 * What a reading's age means, which is not the same thing as the number.
 *
 * `steady` is the distinction that makes this honest. An enumerated symbol carries the moment its
 * state last *changed*, so a computer reporting the same mode for a month is working perfectly and
 * a grid that painted it red would be lying about a fault. A continuous measurement's timestamp
 * dates the last number a sensor produced, and a month there is a sensor that stopped. Same field,
 * opposite meanings, and only the second is `stopped`.
 */
export type Freshness = 'live' | 'minutes' | 'hours' | 'stopped' | 'steady' | 'none'

/** Past a day, a continuous channel is not slow — it has stopped. */
export const STOPPED_MS = 24 * 3_600_000
/** Between a minute and this, a channel is simply slow; several legitimately are. */
const SLOW_MS = 3_600_000

export interface Reading {
  pui: string
  state: Freshness
  /** Null when nothing has arrived, or when the sample carries no usable onboard timestamp. */
  ageMs: number | null
  /** An enumerated state rather than a measurement — see `steady` above. */
  enumerated: boolean
}

/**
 * Where one symbol stands.
 *
 * A sample with no usable timestamp falls back to arrival, as it does everywhere else in the
 * application — eight of the 163 publish none — and the fallback is only ever reached before that
 * symbol's first timestamped value lands.
 */
export function readingOf(pui: string, sample: TelemetrySample | undefined, now: number): Reading {
  const enumerated = !!getSymbol(pui)?.values
  if (!sample) return { pui, state: 'none', ageMs: null, enumerated }

  // `onboardAt` is the same parse, done once at receipt where the year is unambiguous — repeating
  // it here resolved the year against a different clock, and did it for 163 symbols a second.
  const ageMs = sample.onboardAt !== null ? now - sample.onboardAt : now - sample.receivedAt

  if (ageMs <= LIVE_THRESHOLD_MS) return { pui, state: 'live', ageMs, enumerated }
  if (ageMs <= SLOW_MS) return { pui, state: 'minutes', ageMs, enumerated }
  if (ageMs <= STOPPED_MS) return { pui, state: 'hours', ageMs, enumerated }
  return { pui, state: enumerated ? 'steady' : 'stopped', ageMs, enumerated }
}

export type Tally = Record<Freshness, number>

export function tally(readings: Reading[]): Tally {
  const counts: Tally = { live: 0, minutes: 0, hours: 0, stopped: 0, steady: 0, none: 0 }
  for (const reading of readings) counts[reading.state] += 1
  return counts
}

/**
 * The states, in the order they are worth reading — worst first.
 *
 * `none` sits at the end deliberately: before the first values land every symbol is in it, and a
 * summary that opened on "163 not received" during the second the page takes to fill would be
 * alarming and wrong.
 */
export const FRESHNESS_ORDER: Freshness[] = ['stopped', 'hours', 'minutes', 'live', 'steady', 'none']

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  live: 'measured in the last minute',
  minutes: 'minutes old',
  hours: 'hours old',
  stopped: 'no reading for over a day',
  steady: 'a state, unchanged for over a day',
  none: 'nothing received',
}

/** The short form, for a legend and for the line on the closed panel. */
export const FRESHNESS_SHORT: Record<Freshness, string> = {
  live: 'live',
  minutes: 'minutes',
  hours: 'hours',
  stopped: 'stopped',
  steady: 'steady',
  none: 'no data',
}

/**
 * The closed panel's one line: the worst news, then the reassuring one, and nothing else.
 *
 * Two terms, not three. Measured in the built page, `15 stopped · 5 hours old · 88 live` was
 * clipped to `88 li…` in the side column — and a heading that loses its last word is worse than
 * one that never had it. The middle term appears only when there is no worse news to displace it.
 */
export function summarise(counts: Tally): string {
  const worst =
    counts.stopped > 0
      ? `${counts.stopped} stopped`
      : counts.hours > 0
        ? `${counts.hours} hours old`
        : null

  if (counts.live === 0) return worst ?? (counts.none > 0 ? 'waiting for data' : 'no data')
  return worst ? `${worst} · ${counts.live} live` : `${counts.live} live`
}
