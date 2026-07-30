/**
 * Time series chart, in SVG.
 *
 * One series per chart: two quantities of different scale get two charts, never two vertical axes.
 * The visual specs follow the data-visualisation guidelines — 2 px stroke, hairline grid one step
 * off the surface, marker of at least 8 px ringed in the surface colour, value labelled only at
 * the end of the line, and text in ink colours rather than the series colour.
 */
import { useId, useMemo, useState } from 'react'

export interface Point {
  t: number
  value: number
}

/** Shaded background band, marking a state (shadow, loss of signal…). */
export interface Band {
  from: number
  to: number
  color: string
  label?: string
}

interface LineChartProps {
  points: Point[]
  /** What the line represents, shown as the title. */
  title: string
  unit?: string
  bands?: Band[]
  height?: number
  /**
   * Width of the drawing's own coordinate system.
   *
   * Not a rendered size — the SVG still stretches to its container. It is the *resolution* the
   * chart is drawn at: leave it at 340 in a narrow column and stretch that to 620 px, and every
   * label, tick and stroke is magnified with it. Widening the viewBox instead keeps the type at
   * its intended size and buys real horizontal room for the series.
   */
  width?: number
  /** Series colour. A single hue: palettes are reserved for multi-series charts. */
  color?: string
  /** Decimal places for annotated values. */
  precision?: number
  /** Message shown when the series is empty. */
  emptyMessage?: string
}

const PADDING = { top: 14, right: 52, bottom: 22, left: 46 }

export function LineChart({
  points,
  title,
  unit,
  bands = [],
  height = 150,
  width = 340,
  color = '#ffb03a',
  precision = 1,
  emptyMessage = 'No data to plot.',
}: LineChartProps) {
  const clipId = useId()
  const [hover, setHover] = useState<Point | null>(null)

  const scale = useMemo(() => {
    if (points.length < 2) return null

    const times = points.map((point) => point.t)
    const values = points.map((point) => point.value)
    const tMin = Math.min(...times)
    const tMax = Math.max(...times)
    let vMin = Math.min(...values)
    let vMax = Math.max(...values)
    if (vMin === vMax) {
      vMin -= 1
      vMax += 1
    }
    // Vertical margin so the line never touches the edges of the frame.
    const margin = (vMax - vMin) * 0.12
    vMin -= margin
    vMax += margin

    const plotWidth = width - PADDING.left - PADDING.right
    const plotHeight = height - PADDING.top - PADDING.bottom

    return {
      tMin,
      tMax,
      vMin,
      vMax,
      x: (t: number) => PADDING.left + ((t - tMin) / (tMax - tMin)) * plotWidth,
      y: (value: number) =>
        PADDING.top + plotHeight - ((value - vMin) / (vMax - vMin)) * plotHeight,
      plotWidth,
      plotHeight,
    }
  }, [points, height, width])

  if (!scale) {
    return (
      <figure className="chart">
        <figcaption className="chart__title">{title}</figcaption>
        <p className="chart__empty">{emptyMessage}</p>
      </figure>
    )
  }

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${scale.x(point.t)} ${scale.y(point.value)}`)
    .join(' ')

  const last = points[points.length - 1]
  const ticks = niceTicks(scale.vMin, scale.vMax)

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    // The SVG is scaled by the layout: convert back into viewBox coordinates.
    const xInViewBox = ((event.clientX - rect.left) / rect.width) * width
    const ratio = Math.min(1, Math.max(0, (xInViewBox - PADDING.left) / scale.plotWidth))
    const t = scale.tMin + ratio * (scale.tMax - scale.tMin)

    // Nearest point to the cursor, so the tooltip always shows a real measurement.
    let nearest = points[0]
    for (const point of points) {
      if (Math.abs(point.t - t) < Math.abs(nearest.t - t)) nearest = point
    }
    setHover(nearest)
  }

  return (
    <figure className="chart">
      <figcaption className="chart__title">
        {title}
        {unit && <span className="chart__unit">{unit}</span>}
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart__svg"
        role="img"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={PADDING.left}
              y={PADDING.top}
              width={scale.plotWidth}
              height={scale.plotHeight}
            />
          </clipPath>
        </defs>

        {/* State bands, below the grid */}
        <g clipPath={`url(#${clipId})`}>
          {bands.map((band, index) => (
            <rect
              key={`${band.from}-${index}`}
              x={scale.x(Math.max(band.from, scale.tMin))}
              y={PADDING.top}
              width={Math.max(
                0,
                scale.x(Math.min(band.to, scale.tMax)) - scale.x(Math.max(band.from, scale.tMin)),
              )}
              height={scale.plotHeight}
              fill={band.color}
            />
          ))}
        </g>

        {/* Grid and ticks */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={scale.y(tick)}
              y2={scale.y(tick)}
              stroke="#1e2937"
              strokeWidth={1}
            />
            <text x={PADDING.left - 6} y={scale.y(tick) + 3} className="chart__tick" textAnchor="end">
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {/* The series */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${clipId})`}
        />

        {/* End marker, ringed in the surface colour */}
        <circle cx={scale.x(last.t)} cy={scale.y(last.value)} r={4} fill={color} stroke="#0d121b" strokeWidth={2} />
        <text
          x={scale.x(last.t) + 8}
          y={scale.y(last.value) + 4}
          className="chart__endlabel"
        >
          {last.value.toFixed(precision)}
        </text>

        {/* Read-out crosshair */}
        {hover && (
          <g>
            <line
              x1={scale.x(hover.t)}
              x2={scale.x(hover.t)}
              y1={PADDING.top}
              y2={PADDING.top + scale.plotHeight}
              stroke="#2c3a4d"
              strokeWidth={1}
            />
            <circle
              cx={scale.x(hover.t)}
              cy={scale.y(hover.value)}
              r={4}
              fill={color}
              stroke="#0d121b"
              strokeWidth={2}
            />
          </g>
        )}

        {/* Time bounds */}
        <text x={PADDING.left} y={height - 6} className="chart__tick">
          {formatTime(scale.tMin)}
        </text>
        <text x={width - PADDING.right} y={height - 6} className="chart__tick" textAnchor="end">
          {formatTime(scale.tMax)}
        </text>
      </svg>

      <p className="chart__readout">
        {hover
          ? `${formatTime(hover.t)} — ${hover.value.toFixed(precision)} ${unit ?? ''}`
          : `${points.length} points`}
      </p>
    </figure>
  )
}

function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return value.toFixed(0)
  if (Math.abs(value) >= 10) return value.toFixed(0)
  return value.toFixed(1)
}

/** Three to four ticks on round values. */
function niceTicks(min: number, max: number): number[] {
  const span = max - min
  if (span <= 0) return [min]
  const rawStep = span / 3
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep) ?? magnitude

  const ticks: number[] = []
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
    ticks.push(Number(value.toFixed(6)))
  }
  return ticks
}
