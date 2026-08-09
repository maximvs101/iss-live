// @vitest-environment jsdom
/**
 * The safety net, caught once.
 *
 * It wraps the 3D views so that a missing driver or a lost WebGL context costs the scene and not
 * the application — the panels and the orbital position stay readable. Nothing had ever made it
 * catch anything: it was written, styled, and left to a failure mode that only shows up on someone
 * else's machine.
 *
 * Two of these did in fact happen during development, both from a hot reload leaving a stale
 * reference — `Bvh is not defined`, then `GLOW is not defined` — and both times the boundary did
 * its job. That is anecdote, not coverage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('WebGL context lost')
}

beforeEach(() => {
  // React logs the caught error itself, and the boundary logs it again on purpose. Neither is a
  // test failure, and both would otherwise bury the reporter.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('the scene error boundary', () => {
  it('gets out of the way when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>the scene</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('the scene')).toBeTruthy()
    expect(document.querySelector('.scene-error')).toBeNull()
  })

  it('replaces a scene that throws, and says the data is still there', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(document.querySelector('.scene-error')).not.toBeNull()
    expect(screen.getByText('3D view unavailable')).toBeTruthy()
    // The reassurance is the point: the reader has lost a view, not the application.
    expect(screen.getByText(/data remains available/i)).toBeTruthy()
    // And the actual failure, verbatim, because "something went wrong" helps nobody.
    expect(screen.getByText('WebGL context lost')).toBeTruthy()
  })

  it('takes a title from the caller when it is given one', () => {
    render(
      <ErrorBoundary fallbackTitle="Station model unavailable">
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Station model unavailable')).toBeTruthy()
  })

  it('reports the failure to the console rather than swallowing it', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain('[scene] rendering stopped:')
  })
})
