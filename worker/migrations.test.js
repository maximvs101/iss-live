import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * schema.sql starts by dropping the liveness table: it builds a fresh database. The index /status
 * needs was first added only there, and the obvious way to apply it — running that file against the
 * live database — would have erased every minute the collector ever recorded. It lives in a
 * migration of its own, which can only add.
 */
describe('the /status index migration', () => {
  const sql = readFileSync(new URL('./migrations/0002_liveness_live.sql', import.meta.url), 'utf8')

  it('adds the partial index, and nothing else', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS liveness_live ON liveness\(at\) WHERE pushes > 0;/)
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER)\b/i)
  })
})
