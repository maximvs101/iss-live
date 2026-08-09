// @vitest-environment jsdom
/**
 * The local history ring, and in particular the pruning that keeps it a ring.
 *
 * This module had no coverage of any kind, which mattered the day the pruning was rewritten: it
 * went from `getAll` — every record, values included, loaded to throw nearly all of it away — to a
 * key cursor, and nothing anywhere executed a line of the new version. Typecheck, lint and the
 * whole suite were green over code that had never run.
 *
 * The case worth naming is the *last* symbol. The cursor walks the store, and each time the symbol
 * changes it deletes the overflow of the one just finished; the final symbol has no successor, so
 * its overflow is deleted after the cursor is exhausted. An IndexedDB transaction commits once no
 * request is outstanding and control returns to the event loop, which makes that last delete
 * exactly the kind of thing that works in one engine and throws `TransactionInactiveError` in
 * another. Two symbols over capacity is therefore not a variation on one symbol — it is the test.
 *
 * Two things this file learned the hard way, both of them about the harness rather than the code:
 *
 *   - `pruneHistory` has to be awaited. Going through `appendHistory` measured nothing at all: the
 *     write path fires the prune and walks away — correctly, since a write must not wait on
 *     housekeeping — so the store read back still held every point just written.
 *   - the database has to be replaced between tests. The module caches its connection, so tests
 *     sharing one store fail in whichever order leaves the most behind, and the failure looks like
 *     a bug in the pruning. It was not.
 *
 * Filling the ring is the slow part: capacity is 7200 points and there is no way to overflow it
 * with fewer. Everything that needs a full ring is therefore checked in one test rather than three
 * — trimming, which end survives, the last symbol, and a small symbol left alone — so the suite
 * pays that cost once.
 */
// `/auto` for the globals `idb` reaches for — IDBRequest, IDBKeyRange and the rest — which a bare
// `new IDBFactory()` does not install. The factory is then replaced per test, below, for isolation.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_POINTS_PER_PUI, type HistoryPoint } from './indexeddb'

/** `n` points for one symbol, timestamps ascending from zero. */
function series(pui: string, n: number): HistoryPoint[] {
  return Array.from({ length: n }, (_, i) => ({ pui, t: i, value: i }))
}

let history: typeof import('./indexeddb')

beforeEach(async () => {
  const { IDBFactory } = await import('fake-indexeddb')
  globalThis.indexedDB = new IDBFactory()
  // The module holds its connection in a module-level promise, so a fresh factory is only fresh
  // once the module is re-evaluated with it.
  vi.resetModules()
  history = await import('./indexeddb')
})

describe('the history ring', () => {
  it('trims every symbol that is over capacity, and only those, keeping the newest', async () => {
    const middleOverflow = 30
    const lastOverflow = 40

    /*
     * The names carry the test. Keys sort by [pui, t], so the store is walked A, M, Z — and the
     * symbol that has to be over capacity is the *last* one, whose overflow is deleted after the
     * cursor is exhausted rather than at a change of key.
     *
     * A first attempt put the small symbol last. Deleting the final `trim()` from the module left
     * every assertion passing, because the last symbol needed no trimming: the test named the case
     * in its comment and did not exercise it. With Z over capacity, that same deletion fails it.
     */
    await history.appendHistory([
      ...series('A_UNDER', 5),
      ...series('M_OVER', MAX_POINTS_PER_PUI + middleOverflow),
      ...series('Z_OVER_AND_LAST', MAX_POINTS_PER_PUI + lastOverflow),
    ])
    await history.pruneHistory()

    const under = await history.readHistory('A_UNDER')
    const middle = await history.readHistory('M_OVER')
    const last = await history.readHistory('Z_OVER_AND_LAST')

    // Under capacity: untouched, not trimmed towards anything.
    expect(under).toHaveLength(5)
    expect(middle).toHaveLength(MAX_POINTS_PER_PUI)
    expect(last).toHaveLength(MAX_POINTS_PER_PUI)

    // The oldest went first, so the survivors begin where the overflow ended.
    expect(middle[0].t).toBe(middleOverflow)
    expect(last[0].t).toBe(lastOverflow)
    expect(last[last.length - 1].t).toBe(MAX_POINTS_PER_PUI + lastOverflow - 1)
  })

  it('does nothing, and does not throw, on an empty store or an empty batch', async () => {
    await expect(history.appendHistory([])).resolves.toBeUndefined()
    await expect(history.pruneHistory()).resolves.toBeUndefined()
  })

  it('reads back only the requested symbol, and only from the requested time', async () => {
    await history.appendHistory([...series('X', 10), ...series('Y', 10)])

    const x = await history.readHistory('X')
    expect(x).toHaveLength(10)
    expect(x.every((point) => point.pui === 'X')).toBe(true)

    const recent = await history.readHistory('X', 6)
    expect(recent.map((point) => point.t)).toEqual([6, 7, 8, 9])
  })
})
