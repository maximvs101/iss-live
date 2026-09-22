/**
 * The sky, flattened for a chart and put into words for a sentence.
 *
 * The chart is drawn the way a printed star chart is: as the sky looks lying on your back with
 * your head to the north. That puts east on the LEFT — the mirror of a map, and the mistake the
 * first mockup made. Held over your head, a map-oriented chart points you the wrong way.
 */
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
const NAMES: Record<string, string> = { N: 'north', E: 'east', S: 'south', W: 'west' }

/** Azimuth clockwise from north, elevation above the horizon, both in degrees. */
export function project(azimuthDeg: number, elevationDeg: number): { x: number; y: number } {
  const r = (90 - Math.min(90, Math.max(0, elevationDeg))) / 90
  const a = (azimuthDeg * Math.PI) / 180
  return { x: -r * Math.sin(a), y: -r * Math.cos(a) }
}

export function compass(azimuthDeg: number): string {
  const wrapped = ((azimuthDeg % 360) + 360) % 360
  return POINTS[Math.round(wrapped / 22.5) % 16]
}

/** 'SSW' → 'south-south-west': the point spelt out, hyphenated as the compass rose writes it. */
export function compassWords(azimuthDeg: number): string {
  return [...compass(azimuthDeg)].map((letter) => NAMES[letter]).join('-')
}

/** "67°" means nothing standing in a garden; a fraction of the way up the sky does. */
export function heightWords(elevationDeg: number): string {
  if (elevationDeg < 20) return 'low'
  if (elevationDeg < 40) return 'a third of the way up'
  if (elevationDeg < 55) return 'halfway up'
  if (elevationDeg < 75) return 'two-thirds of the way up'
  return 'almost overhead'
}
