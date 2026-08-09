/**
 * Local telemetry history.
 *
 * The application has no server: the history lives in the browser, in IndexedDB. Each symbol keeps
 * a ring of points; past that capacity, the oldest are dropped. That is enough to plot several
 * hours of a session without letting storage grow without bound.
 */
import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'iss-live'
const DB_VERSION = 1
const STORE = 'samples'

/**
 * Points kept per symbol. At 1 Hz that is roughly two hours.
 *
 * Exported so the pruning test can state the capacity once rather than restate the number.
 */
export const MAX_POINTS_PER_PUI = 7200
/** Pruning runs periodically rather than on every write, to spare the database. */
const PRUNE_INTERVAL_MS = 5 * 60_000

export interface HistoryPoint {
  pui: string
  /** Time of receipt, in milliseconds. */
  t: number
  value: number
}

let dbPromise: Promise<IDBPDatabase> | null = null
let lastPrune = 0

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: ['pui', 't'] })
        store.createIndex('by-pui', 'pui')
      },
    })
  }
  return dbPromise
}

/** Stores a batch of points. Non-numeric values (states, enumerations) are ignored. */
export async function appendHistory(points: HistoryPoint[]): Promise<void> {
  if (points.length === 0) return
  const db = await getDb()
  const tx = db.transaction(STORE, 'readwrite')
  await Promise.all(points.map((point) => tx.store.put(point)))
  await tx.done

  if (Date.now() - lastPrune > PRUNE_INTERVAL_MS) {
    lastPrune = Date.now()
    void pruneHistory()
  }
}

/** Series for one symbol, oldest first. */
export async function readHistory(pui: string, sinceMs?: number): Promise<HistoryPoint[]> {
  const db = await getDb()
  const lowerBound = sinceMs ?? 0
  const range = IDBKeyRange.bound([pui, lowerBound], [pui, Number.MAX_SAFE_INTEGER])
  return (await db.getAll(STORE, range)) as HistoryPoint[]
}

/**
 * Trims each symbol back to capacity by deleting its oldest points.
 *
 * A key cursor rather than `getAll`, which is what this used to be. `getAll` read every record —
 * values and all — into an array in order to throw most of it away: at 163 symbols against a full
 * ring that is 1.2 million points loaded every five minutes to delete a few hundred, and the
 * history survives across sessions, so the ring does fill.
 *
 * Keys are `[pui, t]`, and IndexedDB iterates keys in order, so the points of one symbol arrive
 * together and already oldest-first. That removes the grouping, removes the sort, and holds one
 * symbol's timestamps at a time instead of the whole store.
 *
 * Exported only so the tests can await it. `appendHistory` fires it and walks away, which is right
 * for a write path that must not wait on housekeeping — and is why a test that goes through
 * `appendHistory` alone reads the store back before any of this has happened.
 */
export async function pruneHistory(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE, 'readwrite')

  let pui: string | null = null
  let times: number[] = []

  /** Deletes the overflow of the symbol just finished. `times` is ascending, so the excess leads. */
  const trim = () => {
    if (pui === null) return
    for (let i = 0; i < times.length - MAX_POINTS_PER_PUI; i += 1) {
      void tx.store.delete([pui, times[i]])
    }
    times = []
  }

  let cursor = await tx.store.openKeyCursor()
  while (cursor) {
    const [itemPui, t] = cursor.primaryKey as [string, number]
    if (itemPui !== pui) {
      trim()
      pui = itemPui
    }
    times.push(t)
    cursor = await cursor.continue()
  }
  // The final symbol has no successor to flush it, so its overflow goes here — after the cursor is
  // exhausted but before the transaction is allowed to settle.
  trim()

  await tx.done
}
