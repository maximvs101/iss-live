/**
 * The grid of close-up tiles, and which one the station is over.
 *
 * The global map is 10800 across, which is 3.71 km per texel, and the scene shows about **one
 * kilometre per screen pixel** — so it is magnified nearly four times and reads as unfinished. No
 * single global texture can fix that: 40 000 across would be needed for one texel per pixel, and
 * the GPU stops at 16 384. What can fix it is noticing that the station only ever sees a disc some
 * 4 600 km wide, which is 1.3 % of the planet.
 *
 * So one tile is loaded at a time, covering the ground under the station at **0.98 km per texel** —
 * a texel to a pixel, which is where sharpening stops paying. Everything outside it keeps the
 * global map, which is right rather than merely cheap: past the tile the ground is far away and the
 * haze has washed it out anyway.
 *
 * **The tiles carry structure, not colour.** They are stored as a ratio against the global map of
 * the month they were cut from, so a tile multiplies rather than replaces: the season, the snow
 * line and the colour all keep coming from the twelve monthly maps, and the tile only puts back the
 * detail those maps are too coarse to hold. That is what makes one set of tiles serve all twelve
 * months instead of twelve sets serving one each — 5.4 GB of source imagery avoided, and no January
 * coastline wearing August's colour.
 */

/**
 * Degrees of latitude and longitude a tile spans.
 *
 * 18 rather than a rounder number because NASA's 500 m imagery arrives as eight pieces of **90°**,
 * and 90 divides by 18. At 20 it does not: a tile would straddle two source files four times round
 * the equator, and stitching a seam is work that buys nothing when a different number avoids it.
 */
export const TILE_DEGREES = 18

/** Pixels across a tile: 18° at the equator is 2 002 km, so this is 0.977 km per texel. */
export const TILE_PIXELS = 2048

/**
 * How far from the equator tiles are cut.
 *
 * Not a margin but the exact figure: the ISS reaches 51.6° and its horizon is 20.4° of arc past
 * that, so **72°** is the highest latitude that can ever appear in the view. It also happens to be
 * four tiles, which is why the grid stops cleanly rather than being trimmed.
 */
export const TILE_LATITUDE_LIMIT = 72

export const TILE_COLUMNS = 360 / TILE_DEGREES
export const TILE_ROWS = (2 * TILE_LATITUDE_LIMIT) / TILE_DEGREES

export interface TileId {
  /** 0 at 180° W, increasing eastwards. */
  column: number
  /** 0 at the southern limit, increasing northwards. */
  row: number
}

/** The tile holding a point, or null above 72°, where nothing is ever in frame. */
export function tileAt(latitude: number, longitude: number): TileId | null {
  if (Math.abs(latitude) >= TILE_LATITUDE_LIMIT) return null
  const wrapped = ((((longitude + 180) % 360) + 360) % 360)
  return {
    column: Math.min(TILE_COLUMNS - 1, Math.floor(wrapped / TILE_DEGREES)),
    row: Math.min(TILE_ROWS - 1, Math.floor((latitude + TILE_LATITUDE_LIMIT) / TILE_DEGREES)),
  }
}

/** Where a tile's edges are, in degrees. */
export function tileBounds(id: TileId) {
  const west = -180 + id.column * TILE_DEGREES
  const south = -TILE_LATITUDE_LIMIT + id.row * TILE_DEGREES
  return { west, east: west + TILE_DEGREES, south, north: south + TILE_DEGREES }
}

/**
 * The same box in the sphere's own texture coordinates, which is what the shader wants.
 *
 * Deliberately derived from `tileBounds` rather than written out again: the sphere's `u` runs from
 * 180° W and its `v` from the south pole, and a second copy of that convention is a second place
 * for it to be wrong.
 */
export function tileUvBox(id: TileId) {
  const { west, south } = tileBounds(id)
  return {
    origin: [(west + 180) / 360, (south + 90) / 180] as [number, number],
    size: [TILE_DEGREES / 360, TILE_DEGREES / 180] as [number, number],
  }
}

/** File name for a tile. Column and row rather than latitude, so the grid is readable in a listing. */
export function tileName(id: TileId): string {
  return `earth-detail-${String(id.column).padStart(2, '0')}-${String(id.row).padStart(2, '0')}.jpg`
}

/** Every cell of the grid, for the build to walk. */
export function allTiles(): TileId[] {
  const tiles: TileId[] = []
  for (let row = 0; row < TILE_ROWS; row += 1) {
    for (let column = 0; column < TILE_COLUMNS; column += 1) tiles.push({ column, row })
  }
  return tiles
}

/**
 * How far into the tile, from 0 at the western and southern edges to 1 at the far ones.
 *
 * Used to fade the detail out before the edge is reached, so the ground does not step in sharpness
 * along a straight line of longitude. A seam the eye can find is worse than the blur it replaces.
 */
export function tileFraction(latitude: number, longitude: number, id: TileId): [number, number] {
  const { west, south } = tileBounds(id)
  const wrapped = ((((longitude - west + 180) % 360) + 360) % 360) - 180
  return [wrapped / TILE_DEGREES, (latitude - south) / TILE_DEGREES]
}
