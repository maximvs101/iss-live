/**
 * Plot of a telemetry parameter, drawn from the history kept in the browser.
 *
 * The history starts when the page opens and only fills if the station transmits: for as long as
 * the public broadcast is interrupted, the plot stays empty — and says so.
 */
import { useEffect, useState } from 'react'
import { getSymbol } from '../../data/catalog'
import { getChannel } from '../../telemetry/subsystems'
import { resolveUnit } from '../../telemetry/units'
import { readHistory } from '../../history/indexeddb'
import { HISTORY_INTERVAL_MS } from '../../telemetry/client'
import { useTelemetryStore } from '../../telemetry/store'
import { LineChart, type Point } from './LineChart'
import { useElementWidth } from '../useElementWidth'

interface TelemetryChartProps {
  pui: string
  /** Window shown, in minutes. */
  windowMinutes?: number
  /** Drawing height, in the same units as the measured width. */
  height?: number
}

export function TelemetryChart({ pui, windowMinutes = 60, height }: TelemetryChartProps) {
  /**
   * The chart is drawn at exactly the number of units it occupies in pixels, so its scale is 1
   * whatever column it lands in. Before the first measurement the width is 0; 340 stands in for
   * that single frame, and the axis padding needs about 140 units, so anything narrower would give
   * the series negative room.
   */
  const [box, measured] = useElementWidth<HTMLDivElement>()
  const width = Math.max(measured, 340)

  const [points, setPoints] = useState<Point[]>([])
  /*
   * The signal to re-read, and it is deliberately not the update counter.
   *
   * That counter moves on every flush — four times a second while the stream is running — but the
   * history it would send us back to only gains a point every five, so nineteen reads in twenty
   * returned exactly what the chart already had. Bucketing the newest arrival by the archive
   * interval gives a value that changes once per point written and not at all while the stream is
   * silent, which is the same thing the counter was there to express, correctly.
   */
  const historyBucket = useTelemetryStore((store) =>
    store.lastUpdateAt === null ? 0 : Math.floor(store.lastUpdateAt / HISTORY_INTERVAL_MS),
  )

  const symbol = getSymbol(pui)
  const channel = getChannel(pui)

  useEffect(() => {
    let cancelled = false
    const since = Date.now() - windowMinutes * 60_000

    readHistory(pui, since)
      .then((history) => {
        if (cancelled) return
        setPoints(history.map((entry) => ({ t: entry.t, value: entry.value })))
      })
      .catch(() => {
        if (!cancelled) setPoints([])
      })

    return () => {
      cancelled = true
    }
  }, [pui, windowMinutes, historyBucket])

  if (!symbol) return null

  return (
    <div ref={box}>
      <LineChart
        points={points}
        width={width}
        height={height}
        title={channel?.label ?? symbol.description}
        unit={resolveUnit(symbol) ?? undefined}
        precision={symbol.precision ?? 2}
        emptyMessage="No measurement recorded: the station has transmitted nothing since this page was opened."
      />
    </div>
  )
}
