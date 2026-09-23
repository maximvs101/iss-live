/**
 * The home page's two lines about where the station is.
 *
 * Coordinates first, because they are computed at once; the name of the place replaces them when
 * the outlines that give it have loaded — and if they never load, the coordinates stay, which is
 * the same fact said less kindly.
 */
import { formatLatitude, formatLongitude } from '../orbit/coordinates.ts'

export function positionLine(
  state: { latitude: number; longitude: number; altitude: number },
  placeLabel: string | null,
): string {
  const where = placeLabel ?? `${formatLatitude(state.latitude, 1)}, ${formatLongitude(state.longitude, 1)}`
  return `Over ${where}, ${Math.round(state.altitude)} km up.`
}

const kmh = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

export function motionLine(state: { speed: number; shadow: number }): string {
  return `${kmh.format(state.speed * 3600)} km/h · ${state.shadow < 0.5 ? 'in sunlight' : 'in the Earth’s shadow'}`
}
