// @vitest-environment jsdom
/**
 * The few lines in the head of passes/index.html that claim the list's room before the first paint.
 *
 * Tested from the page itself, so the test runs what ships: the inline script is read out of the
 * HTML and executed as the browser would.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import html from '../../passes/index.html?raw'

const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]
const run = () => new Function(script)()
const expecting = () => document.documentElement.classList.contains('passes-expecting')

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="passes-app"></div>'
  window.history.replaceState(null, '', '/passes/?city=paris-fr')
})

afterEach(() => {
  vi.useRealTimers()
  document.documentElement.classList.remove('passes-expecting')
  window.history.replaceState(null, '', '/')
})

describe('the head script', () => {
  it('claims the room when a city is on its way', () => {
    run()
    expect(expecting()).toBe(true)
  })

  it('gives the room back if the page script never arrives', () => {
    // An old browser or a blocked file: the app never mounts, and a screen of blank sat above the
    // text for good.
    run()
    vi.advanceTimersByTime(10_000)
    expect(expecting()).toBe(false)
  })

  it('leaves the room to the app once the app is there', () => {
    run()
    document.getElementById('passes-app')!.innerHTML = '<div class="locate"></div>'
    vi.advanceTimersByTime(10_000)
    expect(expecting()).toBe(true)
  })
})
