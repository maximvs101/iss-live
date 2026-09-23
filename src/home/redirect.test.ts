// @vitest-environment jsdom
/**
 * The first script in the home page's head, run as the browser runs it. It sends links from when
 * the console was the home page — /?part=cupola, in bookmarks, shares and search results — to the
 * console, before anything is drawn. Cloudflare Pages cannot redirect on a query parameter.
 */
import { describe, expect, it, vi } from 'vitest'
import html from '../../index.html?raw'

const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
function visit(search: string, hash = '') {
  const location = { search, hash, replace: vi.fn() }
  new Function('location', script)(location)
  return location.replace
}

describe('the old part links', () => {
  it('go to the console with their part', () => {
    expect(visit('?part=cupola')).toHaveBeenCalledWith('/console/?part=cupola')
  })

  // Review focus 1
  it('keeps the rest of the address', () => {
    expect(visit('?part=cupola&x=1', '#y')).toHaveBeenCalledWith('/console/?part=cupola&x=1#y')
  })

  it('leaves the home page alone without a part', () => {
    expect(visit('')).not.toHaveBeenCalled()
    expect(visit('?utm_source=x')).not.toHaveBeenCalled()
    expect(visit('?partner=1')).not.toHaveBeenCalled()
  })
})
