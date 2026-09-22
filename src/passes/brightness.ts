/**
 * How bright a pass looks, and the one word the page commits to.
 *
 * The station is modelled as a diffuse sphere of standard magnitude −1.8 at 1,000 km and half
 * phase — the figure most often quoted for it. That is a model of a sphere, and the station is a
 * cross of flat panels and radiators whose attitude decides how much light comes back: the real
 * figure can differ by a whole magnitude either way. So the page shows a word, which that
 * uncertainty can carry, and keeps the number for whoever asks.
 */
export const STANDARD_MAGNITUDE = -1.8

export type Brightness = 'very bright' | 'bright' | 'visible but faint'

/** Lambert sphere: fraction of the disc's light returned at a phase angle, relative to full phase. */
function phaseFunction(phaseRad: number): number {
  return (Math.sin(phaseRad) + (Math.PI - phaseRad) * Math.cos(phaseRad)) / Math.PI
}

export function magnitude(rangeKm: number, phaseAngleDeg: number): number {
  const phase = (Math.min(180, Math.max(0, phaseAngleDeg)) * Math.PI) / 180
  const relative = Math.max(phaseFunction(phase), 1e-6) / phaseFunction(Math.PI / 2)
  return STANDARD_MAGNITUDE + 5 * Math.log10(rangeKm / 1000) - 2.5 * Math.log10(relative)
}

export function brightnessOf(value: number): Brightness {
  if (value <= -2.5) return 'very bright'
  if (value <= -1) return 'bright'
  return 'visible but faint'
}
