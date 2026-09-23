/**
 * Land outlines as one SVG path, in the console map's projection (equirectangular: x from longitude,
 * y down from the north). The pen is lifted wherever a ring jumps across the antimeridian — a straight
 * line between 179° E and 179° W is a streak across the whole map. Same rule as the social card.
 */
export function landPath(rings, width, height) {
  const x = (lon) => ((lon + 180) / 360) * width
  const y = (lat) => ((90 - lat) / 180) * height
  const fmt = (n) => String(Math.round(n * 10) / 10)
  return rings
    .map((ring) => {
      let d = ''
      for (let i = 0; i < ring.length; i += 1) {
        const [lon, lat] = ring[i]
        const jump = i > 0 && Math.abs(lon - ring[i - 1][0]) > 180
        d += `${i === 0 || jump ? 'M' : 'L'}${fmt(x(lon))} ${fmt(y(lat))}`
      }
      return `${d}Z`
    })
    .join('')
}
