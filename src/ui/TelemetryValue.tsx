/**
 * Display of a single telemetry value.
 *
 * The rule this component never breaks: missing data is shown as missing. No placeholder zero, no
 * last-known value passed off as current. When a value is old, its age is stated.
 */
import { getSymbol } from '../data/catalog'
import { getChannel } from '../telemetry/subsystems'
import { useSample, useTelemetryStore } from '../telemetry/store'
import { formatValue, isUnitInferred, unitNote } from '../telemetry/units'
import { LIVE_THRESHOLD_MS, formatAge, onboardTimestampToDate } from '../telemetry/health'
import { readingOf } from '../telemetry/freshness'

interface TelemetryValueProps {
  pui: string
  /** Show the label to the left of the value. */
  showLabel?: boolean
  /**
   * Print the explanation beneath the value.
   *
   * Off in the dense subsystem lists, where a paragraph per row would bury the numbers — the
   * text is still there, on the label's tooltip. The inspector, which shows a handful of rows
   * for one selected part, turns it on.
   */
  showHint?: boolean
}

export function TelemetryValue({ pui, showLabel = true, showHint = false }: TelemetryValueProps) {
  const symbol = getSymbol(pui)
  const channel = getChannel(pui)
  const sample = useSample(pui)
  /*
   * The station's own year, for the one row that needs a second reading to be legible.
   *
   * Selected as `null` for every other row so the 163 of them do not re-render when it arrives,
   * and read from the stream rather than from this machine's calendar: the clock names a day of
   * the year, and which year that is belongs to the station.
   */
  const year = useTelemetryStore((state) =>
    pui === 'TIME_000001' ? Number(state.samples['TIME_000002']?.value) || null : null,
  )

  if (!symbol) return null

  const label = channel?.label ?? symbol.description
  const formatted = formatValue(symbol, sample?.value, year)
  // Age is measured from the station's own timestamp, not from when the packet reached us.
  // Several channels re-send month-old readings continuously; timing from arrival would present
  // them as fresh. Arrival time is the fallback for the rare sample with no usable timestamp.
  const measuredAt = sample?.timestamp ? onboardTimestampToDate(sample.timestamp) : null
  const ageMs = measuredAt
    ? Date.now() - measuredAt.getTime()
    : sample
      ? Date.now() - sample.receivedAt
      : null
  const isStale = ageMs !== null && ageMs > LIVE_THRESHOLD_MS
  const note = unitNote(pui)

  /*
   * An old timestamp reads two ways, and this row asks the same question the freshness rule does.
   *
   * On a symbol that reports a state it dates the last *transition* — a computer showing the same
   * state for a month is stable, and saying "28 d old" about it would sound like a fault. On a
   * measurement it dates the last number the sensor produced, so a month-old partial pressure is a
   * sensor that stopped. Only the second is flagged.
   *
   * Asked through `readingOf` rather than answered again here. This file had its own copy — the
   * catalogue's enumeration and a `24 * 3_600_000` written out a second time — and the copy went
   * on saying "this sensor has not reported since" about the station's year and the count of CMGs
   * online for as long as the two rules disagreed.
   */
  const reading = readingOf(pui, sample, Date.now())
  const isStalled = reading.state === 'stopped'
  const measuredLabel = measuredAt
    ? `${measuredAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`
    : null
  const ageTitle = reading.holds
    ? measuredLabel
      ? `Unchanged since ${measuredLabel}`
      : 'Time since this state last changed'
    : measuredLabel
      ? `Measured by the station at ${measuredLabel}${isStalled ? ' — this sensor has not reported since' : ''}`
      : 'Age of the last measurement received'

  return (
    <div className={`telemetry-row${formatted.text === null ? ' telemetry-row--empty' : ''}`}>
      {showLabel && (
        // The symbol identifier goes in the tooltip rather than beside the label. It is the key
        // for looking a parameter up in NASA's catalogue, so it must stay reachable — but printed
        // on all 163 rows it was a column of noise wide enough to cost a whole readings column.
        <span
          className="telemetry-row__label"
          title={`${pui} — ${channel?.hint ?? symbol.description}`}
        >
          {label}
        </span>
      )}
      <span className="telemetry-row__value">
        {formatted.text === null ? (
          <span className="telemetry-row__nodata" title="No data received for this parameter">
            —
          </span>
        ) : (
          <>
            <span className="telemetry-row__number">{formatted.text}</span>
            {formatted.unit && (
              <span
                className={`telemetry-row__unit${isUnitInferred(pui) ? ' telemetry-row__unit--inferred' : ''}`}
                title={note}
              >
                {formatted.unit}
              </span>
            )}
          </>
        )}
        {isStale && ageMs !== null && (
          <span
            className={`telemetry-row__age${isStalled ? ' telemetry-row__age--stalled' : ''}`}
            title={ageTitle}
          >
            {formatAge(ageMs)}
          </span>
        )}
      </span>
      {showHint && channel?.hint && <p className="telemetry-row__hint">{channel.hint}</p>}
    </div>
  )
}
