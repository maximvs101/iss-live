/**
 * Tests for the freshness buckets.
 *
 * The rule worth protecting is the one that took looking at real data to find: a timestamp a month
 * old means opposite things on a measurement and on an enumerated state, and only the first is a
 * fault. Everything else here is boundaries.
 */
import { describe, expect, it } from 'vitest'
import { FRESHNESS_ORDER, readingOf, summarise, tally } from './freshness'
import type { TelemetrySample } from './store'

const NOW = Date.UTC(2026, 7, 16, 12, 0, 0)

/**
 * Hours since the start of the year, on the stream's own origin: hour 24 is 1 January 00:00.
 *
 * Ten decimals rather than the six the stream itself sends, because a boundary case has to test
 * the code and not this helper: one micro-hour is 3.6 ms, so six decimals moved a sample written
 * as exactly sixty seconds old to sixty-one and failed the assertion on the rounding.
 */
function onboard(ageMs: number): string {
  const taken = NOW - ageMs
  const hours = (taken - Date.UTC(2026, 0, 1)) / 3_600_000 + 24
  return hours.toFixed(10)
}

function sample(ageMs: number): TelemetrySample {
  return {
    pui: 'x',
    value: '1',
    calibrated: null,
    timestamp: onboard(ageMs),
    statusClass: null,
    statusIndicator: null,
    statusColor: null,
    receivedAt: NOW,
    onboardAt: NOW - ageMs,
  }
}

/** `S0000003` is the starboard SARJ angle — continuous. `S0000008` is its mode — enumerated. */
const CONTINUOUS = 'S0000003'
const ENUMERATED = 'S0000008'

describe('readingOf', () => {
  it.each([
    ['a second', 1_000, 'live'],
    ['exactly the live threshold', 60_000, 'live'],
    ['just past it', 60_001, 'minutes'],
    ['half an hour', 30 * 60_000, 'minutes'],
    ['exactly an hour', 3_600_000, 'minutes'],
    ['three hours', 3 * 3_600_000, 'hours'],
    ['exactly a day', 24 * 3_600_000, 'hours'],
  ])('puts %s in %s', (_label, ageMs, expected) => {
    expect(readingOf(CONTINUOUS, sample(ageMs), NOW).state).toBe(expected)
  })

  it('calls a measurement older than a day stopped', () => {
    // The partial pressure sensors did exactly this for five days while everything else moved.
    expect(readingOf(CONTINUOUS, sample(5 * 86_400_000), NOW).state).toBe('stopped')
  })

  it('calls an enumerated state older than a day steady, not stopped', () => {
    // A mode flag carries the moment it last *changed*. A computer holding one mode for a month is
    // working; painting it as a fault would be the interface lying about the station.
    const reading = readingOf(ENUMERATED, sample(30 * 86_400_000), NOW)
    expect(reading.enumerated).toBe(true)
    expect(reading.state).toBe('steady')
  })

  it('reports nothing received as its own state, not as very old', () => {
    const reading = readingOf(CONTINUOUS, undefined, NOW)
    expect(reading.state).toBe('none')
    expect(reading.ageMs).toBeNull()
  })

  it('falls back to arrival time when the sample carries no usable timestamp', () => {
    // Eight of the 163 publish none. The fallback must not read as "nothing received".
    const withoutStamp = { ...sample(0), timestamp: null }
    expect(readingOf(CONTINUOUS, withoutStamp, NOW).state).toBe('live')
  })

  it('measures age from the station, never from arrival', () => {
    // The one failure this whole module exists to prevent: a month-old reading delivered a second
    // ago must not read as live.
    const monthOld = { ...sample(30 * 86_400_000), receivedAt: NOW }
    expect(readingOf(CONTINUOUS, monthOld, NOW).state).toBe('stopped')
  })
})

describe('tally and summary', () => {
  it('counts every state and nothing else', () => {
    const counts = tally([
      readingOf(CONTINUOUS, sample(1_000), NOW),
      readingOf(CONTINUOUS, sample(1_000), NOW),
      readingOf(CONTINUOUS, sample(5 * 86_400_000), NOW),
      readingOf(CONTINUOUS, undefined, NOW),
    ])
    expect(counts.live).toBe(2)
    expect(counts.stopped).toBe(1)
    expect(counts.none).toBe(1)
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('leads the summary with what is wrong', () => {
    const counts = tally([
      readingOf(CONTINUOUS, sample(1_000), NOW),
      readingOf(CONTINUOUS, sample(5 * 86_400_000), NOW),
    ])
    expect(summarise(counts)).toBe('1 stopped · 1 live')
  })

  it('keeps the summary to two terms, so the side column cannot clip the last one', () => {
    const counts = tally([
      readingOf(CONTINUOUS, sample(1_000), NOW),
      readingOf(CONTINUOUS, sample(3 * 3_600_000), NOW),
      readingOf(CONTINUOUS, sample(5 * 86_400_000), NOW),
    ])
    // The hours are real and are in the legend; they do not displace the two that matter most.
    expect(summarise(counts)).toBe('1 stopped · 1 live')
  })

  it('promotes the middle term when there is no worse news', () => {
    const counts = tally([
      readingOf(CONTINUOUS, sample(1_000), NOW),
      readingOf(CONTINUOUS, sample(3 * 3_600_000), NOW),
    ])
    expect(summarise(counts)).toBe('1 hours old · 1 live')
  })

  it('says only what is live when nothing is wrong', () => {
    const counts = tally([readingOf(CONTINUOUS, sample(1_000), NOW)])
    expect(summarise(counts)).toBe('1 live')
  })

  it('says it is waiting rather than claiming an outage before anything has landed', () => {
    // Every symbol is in `none` for the second the page takes to fill.
    const counts = tally([readingOf(CONTINUOUS, undefined, NOW)])
    expect(summarise(counts)).toBe('waiting for data')
  })

  it('orders the states worst first, with the empty one last', () => {
    expect(FRESHNESS_ORDER[0]).toBe('stopped')
    expect(FRESHNESS_ORDER[FRESHNESS_ORDER.length - 1]).toBe('none')
  })
})
