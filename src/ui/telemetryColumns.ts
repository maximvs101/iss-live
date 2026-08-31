/**
 * Where the readings are cut into columns, decided here instead of by the browser.
 *
 * The strip used CSS multi-column flow, which balances beautifully and loses the one thing this
 * content cannot afford to lose: which group a reading belongs to. A section runs off the bottom of
 * one column and resumes at the top of the next with no heading over it, so a reader scanning that
 * column meets `Array 3A drive voltage` with nothing to say it is a photovoltaic control unit.
 * Measured on the live page, the fault gets worse as the screen gets bigger:
 *
 *     2560 x 1440    7 columns, 6 of them beginning mid-section
 *     1920 x 1080    5 columns, 3 of them
 *     1366 x  768    3 columns, 2 of them
 *     1024 x  768    2 columns, none
 *
 * A printed table solves this by repeating the heading over the continuation, and that is what this
 * does — which means knowing where the breaks fall, which means placing them here.
 *
 * The column *count* is still the browser's rule, reproduced exactly: `columns: 260px` with an
 * 18 px gutter fits `floor((width + gap) / (width + gap))` columns, and that formula returns 7, 5,
 * 3 and 2 for the four widths above, which is what the browser did.
 */

/** Narrowest a column may be, and the gutter between two. Both are also stated in the stylesheet. */
export const COLUMN_WIDTH = 260
export const COLUMN_GAP = 18

export interface ColumnSection {
  id: string
  label: string
  channels: readonly string[]
}

/** A heading and the run of readings under it, as one column shows them. */
export interface ColumnBlock {
  /** Stable across re-layouts: the section, and where in it this run starts. */
  key: string
  label: string
  /** True where this block resumes a section the previous column began. */
  continued: boolean
  channels: readonly string[]
}

/**
 * How many columns the width affords.
 *
 * The same arithmetic the browser applies to `columns: <length>`: as many as fit, counting one
 * gutter fewer than columns.
 */
export function columnCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1
  return Math.max(1, Math.floor((width + COLUMN_GAP) / (COLUMN_WIDTH + COLUMN_GAP)))
}

/**
 * A heading and a reading are one unit each.
 *
 * Measured rather than assumed: a row is 32 px and a heading 25 with a 6 px margin under it, so
 * counting them alike is 3 % out. Weighting them properly would buy a pixel of balance and cost the
 * arithmetic its legibility.
 */
const HEADING_UNITS = 1

/**
 * Fewest readings worth repeating a heading for.
 *
 * Without this the fill takes whatever room is left, and a column ended on a heading with a
 * single reading under it — two lines of furniture for one number, and the same heading again at
 * the top of the next column. Below two, the whole block waits for the next column instead.
 */
const MIN_RUN = 2

/** Fills columns to at most `target` units each, repeating a heading wherever a section resumes. */
function fill(sections: readonly ColumnSection[], target: number): ColumnBlock[][] {
  const columns: ColumnBlock[][] = [[]]
  let used = 0

  const open = () => {
    columns.push([])
    used = 0
  }

  for (const section of sections) {
    let index = 0
    let continued = false

    while (index < section.channels.length) {
      // A heading alone at the foot of a column points at nothing, and a heading with one reading
      // under it is barely better. Short of that, the whole block starts in the next column.
      const wanted = Math.min(MIN_RUN, section.channels.length - index)
      if (used > 0 && used + HEADING_UNITS + wanted > target) open()

      // The run may overrun the target rather than shrink below `wanted`: a target too small to
      // hold a heading and its minimum would otherwise loop for ever.
      const room = Math.max(wanted, target - used - HEADING_UNITS)
      const take = Math.min(room, section.channels.length - index)

      columns[columns.length - 1].push({
        key: `${section.id}:${index}`,
        label: section.label,
        continued,
        channels: section.channels.slice(index, index + take),
      })

      used += HEADING_UNITS + take
      index += take
      continued = true

      if (index < section.channels.length) open()
    }
  }

  return columns
}

/**
 * The readings, cut into at most `count` columns of even height.
 *
 * Even by trial rather than by formula, and the trial is what the repeated headings force: each one
 * costs a unit the ideal share knew nothing about, so a target derived from the total alone
 * overflows into an extra column. Raising the target until the fill fits is a handful of passes
 * over thirty items, and it is exact where an estimate would be close.
 */
export function distribute(
  sections: readonly ColumnSection[],
  count: number,
): ColumnBlock[][] {
  const withChannels = sections.filter((section) => section.channels.length > 0)
  if (withChannels.length === 0) return []

  const units = withChannels.reduce((total, s) => total + HEADING_UNITS + s.channels.length, 0)
  const columns = Math.max(1, Math.floor(count))

  for (let target = Math.ceil(units / columns); target <= units; target += 1) {
    const filled = fill(withChannels, target)
    if (filled.length <= columns) return filled
  }
  return fill(withChannels, units)
}
