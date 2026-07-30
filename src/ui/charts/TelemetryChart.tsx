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
  // The update counter acts as the signal: no need to re-read the database when nothing arrives.
  const updateCount = useTelemetryStore((store) => store.updateCount)

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
  }, [pui, windowMinutes, updateCount])

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
