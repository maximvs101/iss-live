/**
 * A latitude or longitude as the page prints it: unsigned degrees, then the hemisphere letter.
 *
 * Two decimals by default, not three, because the third was never a measurement. A thousandth of
 * a degree is about 110 m. What this position is actually worth is 0.79 km, which is how far it
 * sits from `api.wheretheiss.at` given the same elements — and that is agreement between two SGP4
 * propagations, not accuracy against the station, which is looser still and grows with the age of
 * the elements. Printing a digit worth 110 m on a figure uncertain by 800 claims a precision
 * nothing here has. Two decimals is 1.1 km, which is honestly the resolution available.
 *
 * The subsolar point gets one: it moves a quarter of a degree a minute and nobody reads it closer.
 *
 * Zero is northern and eastern, as on every chart; the map's own tests pin the choice.
 */
export function formatLatitude(value: number, decimals = 2): string {
  return `${Math.abs(value).toFixed(decimals)}° ${value >= 0 ? 'N' : 'S'}`
}

export function formatLongitude(value: number, decimals = 2): string {
  return `${Math.abs(value).toFixed(decimals)}° ${value >= 0 ? 'E' : 'W'}`
}
