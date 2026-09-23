// @vitest-environment jsdom
/**
 * The home page's live part has its final shape in the HTML, before any script runs.
 *
 * Lighthouse measured 0.204 of layout shift on / : the app's container was empty at first paint,
 * and the line, the map and the next-pass line pushed "What is ISS Live" down when they arrived.
 * The same three elements are now written in the page and replaced in place by the application.
 */
import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'

describe('the home page skeleton', () => {
  it('draws the motion line, the map and the next-pass line before the script', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const app = doc.getElementById('home-app')!
    expect(app.querySelector('.home__motion')).not.toBeNull()
    expect(app.querySelector('.home-map img[src="/home-map.svg"]')).not.toBeNull()
    expect(app.querySelector('.home__next a[href="/passes/"]')).not.toBeNull()
  })
})
