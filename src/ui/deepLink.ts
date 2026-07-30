/**
 * Linking straight to a part of the station.
 *
 * `?part=cupola` opens the Station view with the Cupola already selected, and selecting a part
 * writes the same parameter back into the address bar. That makes a module something you can send
 * to someone — the thing an educational page most often needs and most often cannot do.
 *
 * It also makes the inspector reachable without the 3D scene, which is what made the photograph
 * panel testable in the first place: the canvas is not involved in rendering the side column, only
 * in producing the click that fills it.
 *
 * Parsing and formatting are kept here, apart from React, because they are the part worth testing:
 * an unknown or hostile `part` value must be refused rather than passed into a lookup.
 */
import { PARTS, type PartId } from '../scene/parts'

const PARAM = 'part'

/** The part named by a query string, or null when it names none or names one that does not exist. */
export function partFromSearch(search: string): PartId | null {
  const value = new URLSearchParams(search).get(PARAM)
  // Checked against the inventory rather than cast: this value comes from the address bar, and
  // `PARTS[whatever]` would hand `undefined` to a component that has every right to expect a part.
  return value && Object.hasOwn(PARTS, value) ? (value as PartId) : null
}

/**
 * The query string that should be in the address bar for a given selection.
 *
 * Everything else in the query is preserved: this application owns one parameter, not the URL.
 */
export function searchForPart(part: PartId | null, search: string): string {
  const params = new URLSearchParams(search)
  if (part) params.set(PARAM, part)
  else params.delete(PARAM)
  const text = params.toString()
  return text ? `?${text}` : ''
}
