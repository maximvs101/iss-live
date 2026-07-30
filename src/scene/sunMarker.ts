/**
 * Where to put the "which way is the Sun" marker.
 *
 * Pure, and separate from the component, because the interesting cases are hard to reach with a
 * mouse: the Sun crosses a 42° field in a fraction of a drag, and catching the exact frame where
 * it enters the frustum by hand is luck rather than testing.
 *
 * Works in normalised device coordinates — the [-1, 1] box three.js projects into — and returns a
 * position in [0, 1] of the viewport, which is what CSS wants.
 */

export interface MarkerPlacement {
  /** False when the Sun is on screen: the halo says it better than an arrow can. */
  visible: boolean
  /** Fraction of the viewport width and height, from the top-left. */
  x: number
  y: number
}

/**
 * @param ndcX  projected x, −1 (left) to 1 (right)
 * @param ndcY  projected y, −1 (bottom) to 1 (top)
 * @param behind whether the point is behind the camera
 * @param margin how far in from the edge to sit, as a fraction of the half-box
 */
export function markerPlacement(
  ndcX: number,
  ndcY: number,
  behind: boolean,
  margin = 0.88,
): MarkerPlacement {
  // Projection folds a point behind the camera back into the frame with both signs inverted, so a
  // Sun at your back would otherwise be marked in exactly the wrong direction.
  const x = behind ? -ndcX : ndcX
  const y = behind ? -ndcY : ndcY

  if (!behind && Math.abs(x) <= 1 && Math.abs(y) <= 1) {
    return { visible: false, x: (x + 1) / 2, y: (1 - y) / 2 }
  }

  // Push the direction out to the frame's edge, keeping its angle: the dominant axis lands on the
  // margin and the other one slides along that edge.
  const scale = margin / Math.max(Math.abs(x), Math.abs(y))
  return { visible: true, x: (x * scale + 1) / 2, y: (1 - y * scale) / 2 }
}
