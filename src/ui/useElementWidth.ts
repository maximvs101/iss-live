/**
 * The pixel width an element actually occupies.
 *
 * Charts here are SVG with a viewBox, which means the drawing is *scaled* to whatever box CSS
 * gives it. Type, ticks and stroke weights scale with it, so a chart authored at 340 units and
 * laid out at 620 px comes out magnified and coarse, and the same chart squeezed to 480 comes out
 * shrunk. Both happened while the layout was being reworked, in one afternoon. Measuring the box
 * and drawing at exactly that many units removes the class of problem: the scale is 1 by
 * construction, in any column, at any window size.
 *
 * Measured **twice over**, and the first one is not redundant. `ResizeObserver` delivers through
 * the rendering lifecycle, so a page opened in a background tab gets no callback at all until it
 * is first shown — the chart would sit at its fallback width, visibly wrong, for as long as the
 * tab stayed hidden. Reading `clientWidth` in a layout effect is a synchronous style-and-layout
 * flush that owes nothing to painting, so it is right immediately and everywhere; the observer
 * then only has to handle what changes afterwards.
 */
import { useLayoutEffect, useRef, useState } from 'react'

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    setWidth(element.clientWidth)

    // Whole pixels only. Sub-pixel widths wobble as scrollbars appear and fonts settle, and each
    // wobble would re-render the chart for a change nobody can see.
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
