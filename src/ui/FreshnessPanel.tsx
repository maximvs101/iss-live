/**
 * Every subscribed symbol as one cell, coloured by how old its reading is.
 *
 * Folded shut by default and summarised in its own heading, like the space weather panel: this is
 * context about the data rather than the data, and it earns its space only when the heading says
 * something — `3 stopped · 12 hours old · 148 live`.
 *
 * Grouped by subsystem rather than laid out as one block of 163, because the answer a reader wants
 * is almost never "which symbol" but "which part of the station has gone quiet", and the stalled
 * sensors are all in one of them.
 */
import { useEffect, useState } from 'react'
import { SUBSYSTEMS, getChannel } from '../telemetry/subsystems'
import { useTelemetryStore } from '../telemetry/store'
import { formatAge } from '../telemetry/health'
import {
  FRESHNESS_LABELS,
  FRESHNESS_ORDER,
  FRESHNESS_SHORT,
  readingOf,
  summarise,
  tally,
  type Reading,
} from '../telemetry/freshness'

/**
 * Recomputed every five seconds, not on every flush.
 *
 * The store fires four times a second while the stream runs and none of these cells can change
 * that fast — the boundaries they sit on are a minute and an hour. Five seconds is under the
 * shortest of them by an order of magnitude and costs 163 comparisons a tick.
 */
const REFRESH_MS = 5_000

export function FreshnessPanel() {
  const samples = useTelemetryStore((store) => store.samples)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const groups = SUBSYSTEMS.map((subsystem) => ({
    id: subsystem.id,
    label: subsystem.label,
    readings: [...new Set(subsystem.sections.flatMap((s) => s.channels.map((c) => c.pui)))].map(
      (pui) => readingOf(pui, samples[pui], now),
    ),
  }))
  const all = groups.flatMap((group) => group.readings)
  const counts = tally(all)

  return (
    <details className="panel panel--folding">
      <summary className="panel__toggle">
        {/* Short, because the summary beside it is the part worth reading and a longer title
            squeezed it to "15 s…" — measured in the built page, not guessed at. */}
        <h2 className="panel__title">Data freshness</h2>
        <span className="panel__designation">{summarise(counts)}</span>
      </summary>

      <p className="panel__summary">
        One square per subscribed symbol, shaded by how long ago the <em>station</em> took the
        reading — not by when the packet arrived. The stream re-sends old values at full speed, so
        those two part company exactly where it matters.
      </p>

      {/* The grid is a picture; this is the same thing in a sentence, for a reader who cannot see
          it and for anyone who would rather read it. */}
      <p className="visually-hidden">
        {all.length} symbols:{' '}
        {FRESHNESS_ORDER.filter((state) => counts[state] > 0)
          .map((state) => `${counts[state]} ${FRESHNESS_LABELS[state]}`)
          .join(', ')}
        .
      </p>

      {groups.map((group) => (
        <div className="freshness__group" key={group.id}>
          <h3 className="freshness__subsystem">
            {group.label}
            <span className="freshness__count">{group.readings.length}</span>
          </h3>
          <div className="freshness__grid">
            {group.readings.map((reading) => (
              <Cell key={reading.pui} reading={reading} />
            ))}
          </div>
        </div>
      ))}

      <ul className="freshness__legend">
        {FRESHNESS_ORDER.map((state) => (
          <li key={state}>
            <span className={`freshness__cell freshness__cell--${state}`} aria-hidden="true" />
            {FRESHNESS_SHORT[state]}
            <span className="freshness__legend-count">{counts[state]}</span>
          </li>
        ))}
      </ul>

      <p className="panel__footnote">
        A symbol that has not changed for a day is only a fault if it is a measurement. An
        enumerated state — a mode, a switch — carries the moment it last <em>changed</em>, so a
        computer reporting the same mode for a month is working perfectly; those are counted
        separately as <strong>steady</strong> rather than stopped.
      </p>
    </details>
  )
}

function Cell({ reading }: { reading: Reading }) {
  const label = getChannel(reading.pui)?.label ?? reading.pui
  const age = reading.ageMs === null ? 'nothing received' : `${formatAge(reading.ageMs)} old`
  return (
    <span
      className={`freshness__cell freshness__cell--${reading.state}`}
      // Colour alone says nothing to a screen reader and little to a reader who cannot separate
      // these hues; the state is spelled out here and the legend names every one of them.
      title={`${label} — ${age} · ${FRESHNESS_LABELS[reading.state]}`}
      role="img"
      aria-label={`${label}, ${FRESHNESS_LABELS[reading.state]}`}
    />
  )
}
