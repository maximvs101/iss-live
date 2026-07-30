/**
 * Tests for the "which way is the Sun" marker.
 *
 * Written because the interesting cases cannot be reached by hand: the Sun crosses a 42° field in
 * a fraction of a drag, and catching the frame where it enters the frustum is luck. Two of these
 * pin behaviour that would otherwise never be exercised deliberately.
 */
import { describe, expect, it } from 'vitest'
import { markerPlacement } from './sunMarker'

describe('markerPlacement', () => {
  it('says nothing while the Sun is on screen', () => {
    // The branch that is hardest to catch with a mouse, and the one that matters most: an arrow
    // pointing at something already visible is noise.
    for (const [x, y] of [[0, 0], [0.9, -0.9], [-1, 1]]) {
      expect(markerPlacement(x, y, false).visible).toBe(false)
    }
  })

  it('marks a Sun that is off to one side', () => {
    const right = markerPlacement(3, 0, false)
    expect(right.visible).toBe(true)
    expect(right.x).toBeCloseTo(0.94, 6)
    expect(right.y).toBeCloseTo(0.5, 6)
  })

  it('counts y upwards in the scene and downwards in the page', () => {
    // NDC has +1 at the top; CSS has 0 at the top. Getting this backwards puts the marker at the
    // opposite edge, which looks deliberate and is entirely wrong.
    expect(markerPlacement(0, 3, false).y).toBeCloseTo(0.06, 6)
    expect(markerPlacement(0, -3, false).y).toBeCloseTo(0.94, 6)
  })

  it('slides along the edge the Sun is nearest, rather than jumping to a corner', () => {
    // Dominant axis on the margin, the other proportional: this is what makes the marker track
    // smoothly as the camera turns instead of snapping between four positions.
    const place = markerPlacement(4, 1, false)
    expect(place.x).toBeCloseTo(0.94, 6)
    expect(place.y).toBeGreaterThan(0.3)
    expect(place.y).toBeLessThan(0.5)
  })

  it('sends the marker the right way for a Sun behind the camera', () => {
    // The trap this function exists for. `project` folds a point behind the camera back into the
    // frame with both signs flipped, so an unguarded reading marks a Sun at your back as being
    // dead ahead — and off to the wrong side as well.
    const naive = markerPlacement(0.5, 0, false)
    const behind = markerPlacement(0.5, 0, true)
    expect(naive.visible).toBe(false)
    expect(behind.visible).toBe(true)
    // Projected x was positive; the marker must go to the left.
    expect(behind.x).toBeCloseTo(0.06, 6)
  })

  it('marks a Sun directly behind rather than hiding it', () => {
    expect(markerPlacement(0, 0, true).visible).toBe(true)
  })
})
