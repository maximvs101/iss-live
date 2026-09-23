import { describe, expect, it } from 'vitest'
import { STATUS_HEADERS, status } from './status.js'

/** A D1 stand-in that answers each query by its text. */
function db(rows) {
  return {
    prepare: (sql) => ({ first: async () => (sql.includes('pushes > 0') ? rows.live : rows.last) }),
  }
}
const NOW = Date.parse('2026-09-23T12:00:00Z')

describe('status', () => {
  it('is live when the station spoke in the last ten minutes', async () => {
    const env = { DB: db({ live: { at: '2026-09-23T11:55:12Z' }, last: { at: '2026-09-23T11:59:12Z' } }) }
    expect(await status(env, NOW)).toEqual({ live: true, lastLive: '2026-09-23T11:55:12Z', checkedAt: '2026-09-23T11:59:12Z' })
  })

  it('is silent, with the date it last spoke, otherwise', async () => {
    const env = { DB: db({ live: { at: '2026-09-14T14:14:20Z' }, last: { at: '2026-09-23T11:59:12Z' } }) }
    expect(await status(env, NOW)).toEqual({ live: false, lastLive: '2026-09-14T14:14:20Z', checkedAt: '2026-09-23T11:59:12Z' })
  })

  it('says so when it never spoke', async () => {
    const env = { DB: db({ live: null, last: null }) }
    expect(await status(env, NOW)).toEqual({ live: false, lastLive: null, checkedAt: null })
  })

  it('may be read by the site, and cached for a minute', () => {
    expect(STATUS_HEADERS['access-control-allow-origin']).toBe('https://iss-live.pages.dev')
    expect(STATUS_HEADERS['cache-control']).toBe('public, max-age=60')
  })
})
