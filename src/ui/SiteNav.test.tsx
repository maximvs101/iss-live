// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SiteNav } from './SiteNav'

afterEach(cleanup)

describe('SiteNav', () => {
  it('draws the same five entries as the rendered pages, and marks the console', () => {
    render(<SiteNav path="/console/" />)
    const nav = screen.getByRole('navigation', { name: 'Site' })
    const links = [...nav.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent])
    expect(links).toEqual([
      ['/', 'ISS Live'],
      ['/console/', 'Console'],
      ['/passes/', 'When to see it'],
      ['/station/', 'The station'],
      ['/telemetry/', 'Systems'],
      ['/about/', 'How it works'],
    ])
    expect(screen.getByRole('link', { name: 'Console' }).getAttribute('aria-current')).toBe('page')
  })
})
