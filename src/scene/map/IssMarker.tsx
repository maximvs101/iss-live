/**
 * The station's silhouette, as drawn on the map.
 *
 * A dot says "something is here"; the shape says *what*. The ISS is one of the few spacecraft with
 * a genuinely recognisable outline — a long truss, eight solar wings in two clusters at its ends,
 * and a stack of modules crossing it — so at map scale that outline is worth more than a marker.
 *
 * Drawn in local coordinates about the origin, with the **modules along +x and the truss along y**.
 * That is not an arbitrary choice of axes: it is the station's actual flight attitude. In LVLH the
 * modules lie along the velocity vector and the truss sits across it, so rotating this shape to
 * the ground track's heading puts every part where it really is. `heading` does exactly that.
 */

/** Half-length of the truss, and so the shape's reach in y. Everything else is scaled to it. */
const TRUSS = 9.5

/**
 * One solar array, mirrored into four.
 *
 * The station really carries **eight** wings, in two pairs at each end of the truss. Drawing all
 * eight was the first attempt and it does not survive: the gap between a pair works out below one
 * device pixel at this size, so the wings close up and the whole silhouette reads as a letter H.
 * Each pair is therefore one panel here — which is what the eye resolves in any case.
 */
function Wing({ x, y }: { x: number; y: number }) {
  return <rect x={x} y={y} width={5.4} height={4.8} rx={0.4} />
}

export function IssShape() {
  // Proportioned from the station itself: 109 m across the truss against 73 m tip-to-tip along the
  // arrays, so the shape reaches about two thirds as far fore-and-aft as it does port-to-starboard.
  // The panels start at the truss's edge — floating clear of it they read as four loose blocks
  // rather than as one object.
  const ends = [4.4, -9.2]
  const sides = [0.9, -6.3]

  return (
    <g>
      {/* Truss first, so the modules and wings sit over it. Greyer than the modules: drawn the
          same white, the two cross into one bright blob and the shape reads as a plus sign. */}
      <rect x={-0.9} y={-TRUSS} width={1.8} height={TRUSS * 2} rx={0.5} fill="#9aa6b4" />

      {/* Outlined, so the panels stay legible where the track or the city lights pass beneath. */}
      <g fill="#ffb03a" stroke="#1b2a3d" strokeWidth={0.5}>
        {ends.flatMap((y) => sides.map((x) => <Wing key={`${x},${y}`} x={x} y={y} />))}
      </g>

      {/* The pressurised modules, along the direction of travel. Slender: the real stack is 4 m
          across against a 51 m run, and drawn any thicker it becomes a pebble sitting on the
          truss instead of a line of cylinders. */}
      <rect x={-5} y={-1} width={10} height={2} rx={1} fill="#e8e6e0" />
    </g>
  )
}

/**
 * The silhouette placed on the map, turned to face the way the station is going.
 *
 * `scale` keeps the shape's own coordinates independent of how large it is drawn, so the legend
 * and the map can share it at different sizes without duplicating a single number.
 */
export function IssMarker({
  x,
  y,
  heading,
  scale = 1,
}: {
  x: number
  y: number
  heading: number
  scale?: number
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${heading}) scale(${scale})`}>
      <IssShape />
    </g>
  )
}
