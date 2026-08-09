// @vitest-environment jsdom
/**
 * The chart every panel draws through, checked on the arithmetic that turns numbers into pixels.
 *
 * Its projection was written once and read by eye ever since: a curve that looks plausible is
 * indistinguishable from a curve that is upside down, off by a padding, or flattened onto a range
 * it invented. The two that matter here are that value increases go *up* — SVG's y axis points
 * down, so this is a sign error waiting to happen and nothing on screen would announce it — and
 * that a flat series does not divide by a zero range.
 *
 * Geometry is read back off the path rather than from a snapshot. A snapshot of a `d` attribute
 * locks in the current numbers without ever saying which of them are right.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LineChart, type Point } from './LineChart'

/** The points of the drawn path, in SVG user units. */
function pathPoints(): { x: number; y: number }[] {
  const d = document.querySelector('path[d]')?.getAttribute('d') ?? ''
  return [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }))
}

const rising: Point[] = [
  { t: 0, value: 0 },
  { t: 1_000, value: 5 },
  { t: 2_000, value: 10 },
]

afterEach(cleanup)

describe('the line chart', () => {
  it('draws increasing values upwards', () => {
    // SVG counts y downwards, so "up" means a smaller number. Getting this backwards would produce
    // a chart that is wrong in the one way a reader cannot catch: it still looks like a chart.
    render(<LineChart points={rising} title="Altitude" />)

    const points = pathPoints()
    expect(points.length).toBeGreaterThanOrEqual(3)
    expect(points[points.length - 1].y).toBeLessThan(points[0].y)
    // And time runs left to right.
    expect(points[points.length - 1].x).toBeGreaterThan(points[0].x)
  })

  it('spreads the series across the plot rather than bunching it', () => {
    render(<LineChart points={rising} title="Altitude" width={400} height={200} />)

    const points = pathPoints()
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    // The extremes should reach the edges of the plotting area, minus the padding — a projection
    // that quietly clamps everything into the middle passes an "it drew something" check.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(50)
    // Nothing may land outside the canvas.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(400)
    expect(ys.every((y) => y >= 0 && y <= 200)).toBe(true)
  })

  it('survives a series that never varies', () => {
    // The value range is the divisor. A voltage that holds at 151.2 V all afternoon is the ordinary
    // case here, not a corner one, and a bare division would put NaN into every coordinate.
    render(<LineChart points={[
      { t: 0, value: 151.2 },
      { t: 1_000, value: 151.2 },
      { t: 2_000, value: 151.2 },
    ]} title="Bus voltage" unit="V" />)

    const d = document.querySelector('path[d]')?.getAttribute('d') ?? ''
    expect(d).not.toContain('NaN')
    expect(pathPoints().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })

  it('survives a single point', () => {
    render(<LineChart points={[{ t: 5_000, value: 3 }]} title="One reading" />)
    const d = document.querySelector('path[d]')?.getAttribute('d') ?? ''
    expect(d).not.toContain('NaN')
  })

  it('says there is nothing to draw rather than drawing nothing', () => {
    // An empty chart with no explanation reads as a broken chart, which during a broadcast outage
    // is exactly the wrong impression.
    render(<LineChart points={[]} title="Altitude" emptyMessage="No data yet" />)
    expect(screen.getByText('No data yet')).toBeTruthy()
    expect(document.querySelector('path[d]')).toBeNull()
  })

  it('names the series and its unit', () => {
    render(<LineChart points={rising} title="Altitude" unit="km" />)
    expect(screen.getByText('Altitude')).toBeTruthy()
    expect(document.body.textContent).toContain('km')
  })
})
