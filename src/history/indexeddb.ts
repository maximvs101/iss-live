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

/** Points kept per symbol. At 1 Hz that is roughly two hours. */
const MAX_POINTS_PER_PUI = 7200
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

/** Trims each symbol back to capacity by deleting its oldest points. */
export async function pruneHistory(): Promise<void> {
  const db = await getDb()
  const all = (await db.getAll(STORE)) as HistoryPoint[]

  const byPui = new Map<string, HistoryPoint[]>()
  for (const point of all) {
    const list = byPui.get(point.pui)
    if (list) list.push(point)
    else byPui.set(point.pui, [point])
  }

  const tx = db.transaction(STORE, 'readwrite')
  for (const [, points] of byPui) {
    if (points.length <= MAX_POINTS_PER_PUI) continue
    points.sort((a, b) => a.t - b.t)
    for (const point of points.slice(0, points.length - MAX_POINTS_PER_PUI)) {
      void tx.store.delete([point.pui, point.t])
    }
  }
  await tx.done
}

/** Erases the entire locally stored history. */
export async function clearHistory(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE)
}
