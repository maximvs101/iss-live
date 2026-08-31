/**
 * Tests for the sources credited in the application.
 *
 * A wrong link here is worse than no link: the dialog exists to answer "says who?", and it only
 * answers that if the address goes where it claims. One already caught us out — `isslive.com`
 * returns a cheerful HTTP 200 and lands on a domain-for-sale page, so checking status codes would
 * have passed it. What these tests pin is the part a status code cannot: which host, by name.
 */
import { describe, expect, it } from 'vitest'
import { CODE, DATA, EXTERNAL_LINK } from './sources'

const sources = [...DATA, ...CODE]
const links = sources.map((source) => new URL(source.href))

describe('sources', () => {
  it('credits every place the application fetches from', () => {
    // Five data sources, then the three libraries that do the computing.
    expect(DATA).toHaveLength(5)
    expect(CODE).toHaveLength(3)
  })

  it('points only at the hosts it means to', () => {
    // Named explicitly rather than pattern-matched: a typo'd host is exactly the failure here, and
    // a pattern loose enough to accept the real ones would accept the typo too.
    expect(links.map((url) => url.host).sort()).toEqual([
      'celestrak.org',
      'demos.lightstreamer.com',
      'github.com',
      'github.com',
      'images.nasa.gov',
      'lightstreamer.com',
      'threejs.org',
      'www.naturalearthdata.com',
    ])
  })

  it('never credits the parked domain again', () => {
    // `isslive.com` and `isslive.nasa.gov` both look right and neither is: the first is for sale,
    // the second stopped resolving.
    for (const url of links) {
      expect(url.host).not.toBe('isslive.com')
      expect(url.host).not.toBe('isslive.nasa.gov')
    }
  })

  it('uses https throughout', () => {
    for (const url of links) expect(url.protocol).toBe('https:')
  })

  it('says what each source is for, and how it is reached', () => {
    for (const source of sources) {
      expect(source.name.length).toBeGreaterThan(3)
      expect(source.used.length).toBeGreaterThan(15)
      expect(source.note.length).toBeGreaterThan(15)
    }
  })

  it('opens every outbound link safely', () => {
    // `noopener` matters: without it the opened page gets a handle on this one through
    // `window.opener` and can navigate it elsewhere.
    expect(EXTERNAL_LINK.rel).toContain('noopener')
    expect(EXTERNAL_LINK.rel).toContain('noreferrer')
    expect(EXTERNAL_LINK.target).toBe('_blank')
  })
})
