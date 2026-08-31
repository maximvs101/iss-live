/**
 * The column split, checked on the two things it must never get wrong.
 *
 * A layout function that loses a reading loses it silently — the strip simply has one fewer line
 * and nothing says which. So every case here asserts the readings come out complete and in order,
 * whatever the split did, and only then looks at how the split reads.
 *
 * The column *counts* are pinned at the four strip widths measured on the live page. They are a
 * choice now rather than an imitation of `columns: 260px` — see `COLUMN_WIDTH` for the sweep that
 * chose 300 — so the test exists to catch the width being changed without the consequence being
 * looked at.
 */
import { describe, expect, it } from 'vitest'
import { COLUMN_GAP, COLUMN_WIDTH, columnCount, distribute, type ColumnSection } from './telemetryColumns'

const section = (id: string, n: number): ColumnSection => ({
  id,
  label: id.toUpperCase(),
  channels: Array.from({ length: n }, (_, i) => `${id}-${i}`),
})

/** Every channel of every section, in the order the sections declare them. */
const declared = (sections: readonly ColumnSection[]) => sections.flatMap((s) => [...s.channels])

/** Every channel the layout emitted, reading the columns left to right and each one top to bottom. */
const laid = (columns: ReturnType<typeof distribute>) =>
  columns.flatMap((column) => column.flatMap((block) => [...block.channels]))

describe('how many columns the width affords', () => {
  it('draws the counts the sweep was run against', () => {
    // Widths of `.telemetry__sections` itself, read off the live page at 2560, 1920, 1366 and 1024.
    expect(columnCount(2128)).toBe(6)
    expect(columnCount(1473)).toBe(4)
    expect(columnCount(964)).toBe(3)
    expect(columnCount(677)).toBe(2)
  })

  it('never returns nothing to draw into', () => {
    expect(columnCount(0)).toBe(1)
    expect(columnCount(-100)).toBe(1)
    expect(columnCount(Number.NaN)).toBe(1)
    // The first measurement arrives after the first render; a zero width must not mean zero columns.
    expect(columnCount(COLUMN_WIDTH - 1)).toBe(1)
    expect(columnCount(COLUMN_WIDTH)).toBe(1)
    expect(columnCount(COLUMN_WIDTH * 2 + COLUMN_GAP)).toBe(2)
  })
})

describe('the split', () => {
  // The power subsystem, which is what every measurement in these comments was taken from.
  const power = [section('sarj', 5), section('bga', 9), section('pcu', 16)]

  it('emits every reading exactly once, in order, at every column count', () => {
    for (let count = 1; count <= 9; count += 1) {
      expect(laid(distribute(power, count))).toEqual(declared(power))
    }
  })

  it('never asks for more columns than it was given', () => {
    for (let count = 1; count <= 9; count += 1) {
      expect(distribute(power, count).length).toBeLessThanOrEqual(count)
    }
  })

  it('puts a heading over every run of readings, continuation included', () => {
    for (const column of distribute(power, 5)) {
      for (const block of column) {
        expect(block.label.length).toBeGreaterThan(0)
        // A heading with nothing under it is the fault this replaces, arriving from the other side.
        expect(block.channels.length).toBeGreaterThan(0)
      }
    }
  })

  it('marks a resumed section and only a resumed section', () => {
    const columns = distribute(power, 5)
    const blocks = columns.flat()
    // Whichever way the split lands, the first block of a section is never a continuation and any
    // later block of the same section always is.
    const seen = new Set<string>()
    for (const block of blocks) {
      const id = block.key.split(':')[0]
      expect(block.continued).toBe(seen.has(id))
      seen.add(id)
    }
  })

  it('keeps the columns within a unit of each other', () => {
    // Even columns are the point of doing this here rather than leaving it to the browser, so the
    // tallest may exceed the shortest only by the heading a continuation costs.
    const heights = distribute(power, 5).map((c) => c.reduce((n, b) => n + 1 + b.channels.length, 0))
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(6)
  })

  it('does not break a section it has room for', () => {
    const columns = distribute([section('a', 4), section('b', 4)], 2)
    expect(columns).toHaveLength(2)
    expect(columns[0]).toHaveLength(1)
    expect(columns[1]).toHaveLength(1)
    expect(columns.flat().every((b) => !b.continued)).toBe(true)
  })

  it('splits one long section across the columns it was given', () => {
    const columns = distribute([section('long', 20)], 4)
    expect(columns.length).toBeGreaterThan(1)
    expect(columns.flat()[0].continued).toBe(false)
    expect(columns.flat().slice(1).every((b) => b.continued)).toBe(true)
    expect(laid(columns)).toEqual(declared([section('long', 20)]))
  })

  it('has nothing to say about a subsystem with no readings', () => {
    expect(distribute([], 3)).toEqual([])
    expect(distribute([{ id: 'empty', label: 'Empty', channels: [] }], 3)).toEqual([])
  })

  it('survives a column count of one, and of more columns than readings', () => {
    expect(distribute(power, 1)).toHaveLength(1)
    expect(laid(distribute(power, 1))).toEqual(declared(power))
    expect(laid(distribute(power, 40))).toEqual(declared(power))
  })
})
