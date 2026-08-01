/**
 * Tests for the detail grid.
 *
 * The grid is a convention, and a convention is exactly the kind of thing two files come to
 * disagree about — the build cuts the tiles and the shader samples them, from opposite ends of the
 * same arithmetic. So what is asserted here is the round trip: a point goes to a tile, the tile
 * goes to a box in the sphere's texture coordinates, and that box has to contain the point again.
 */
import { describe, expect, it } from 'vitest'
import {
  TILE_COLUMNS,
  TILE_DEGREES,
  TILE_LATITUDE_LIMIT,
  TILE_PIXELS,
  TILE_ROWS,
  allTiles,
  tileAt,
  tileBounds,
  tileFraction,
  tileName,
  tileUvBox,
} from './earthDetail'

/** The sphere's own convention, as verified in earthOrientation and used by the shader. */
const uvOf = (latitude: number, longitude: number) => [
  longitude / 360 + 0.5,
  latitude / 180 + 0.5,
]

describe('the detail grid', () => {
  it('covers every longitude and the latitudes the station can see', () => {
    expect(TILE_COLUMNS).toBe(20)
    expect(TILE_ROWS).toBe(8)
    // The ISS reaches 51.6° and sees 20.4° of arc past it, so this is the exact visible limit.
    expect(TILE_LATITUDE_LIMIT).toBeCloseTo(51.6 + 20.4, 1)
    // And the tile size has to divide the 90° pieces NASA ships, or a tile straddles two files.
    expect(90 % TILE_DEGREES).toBe(0)
    expect(allTiles()).toHaveLength(160)
  })

  it('resolves a texel to about a screen pixel', () => {
    // The whole point of the exercise. 18° at the equator is 2 002 km across.
    const kmPerTexel = ((TILE_DEGREES / 360) * 2 * Math.PI * 6371) / TILE_PIXELS
    expect(kmPerTexel).toBeCloseTo(0.977, 3)
    // Against the global map's 3.71, and a screen pixel worth about one kilometre.
    expect(kmPerTexel).toBeLessThan(3.71 / 3)
  })

  it('puts a place in the tile whose box contains it', () => {
    for (const [latitude, longitude] of [
      [0, 0], [51.6, 20], [-33.9, 151.2], [45.5, -73.6], [-1, 179.9], [0, -179.9], [71.9, 10], [-71.9, -10],
    ]) {
      const id = tileAt(latitude, longitude)!
      expect(id, `${latitude},${longitude}`).not.toBeNull()
      const [u, v] = uvOf(latitude, longitude)
      const { origin, size } = tileUvBox(id)
      expect(u, `u at ${latitude},${longitude}`).toBeGreaterThanOrEqual(origin[0] - 1e-12)
      expect(u).toBeLessThanOrEqual(origin[0] + size[0] + 1e-12)
      expect(v, `v at ${latitude},${longitude}`).toBeGreaterThanOrEqual(origin[1] - 1e-12)
      expect(v).toBeLessThanOrEqual(origin[1] + size[1] + 1e-12)
    }
  })

  it('has no gaps and no overlaps', () => {
    // Walked at a spacing that is not a divisor of the tile size, so the samples do not all land on
    // edges — a grid that was half a tile out would still pass a walk that only visited corners.
    const seen = new Set<string>()
    for (let latitude = -71.5; latitude < 72; latitude += 3.7) {
      for (let longitude = -179.5; longitude < 180; longitude += 7.3) {
        const id = tileAt(latitude, longitude)!
        const { west, east, south, north } = tileBounds(id)
        expect(longitude).toBeGreaterThanOrEqual(west)
        expect(longitude).toBeLessThan(east)
        expect(latitude).toBeGreaterThanOrEqual(south)
        expect(latitude).toBeLessThan(north)
        seen.add(tileName(id))
      }
    }
    expect(seen.size).toBe(160)
  })

  it('leaves the poles to the global map', () => {
    expect(tileAt(73, 0)).toBeNull()
    expect(tileAt(-85, 30)).toBeNull()
  })

  it('wraps the antimeridian without a hole', () => {
    expect(tileAt(0, 180)).toEqual(tileAt(0, -180))
    expect(tileAt(0, 179.999)!.column).toBe(TILE_COLUMNS - 1)
    expect(tileAt(0, -179.999)!.column).toBe(0)
  })

  it('says how far across its tile a point is, and wraps that too', () => {
    const id = tileAt(0, 5)!
    const [across, up] = tileFraction(0, 5, id)
    expect(across).toBeCloseTo(5 / 18, 9)
    expect(up).toBeCloseTo(0.0, 9)
    // A point on the far side of the antimeridian from its own tile's west edge must not read as
    // eighteen tiles away, which is what an unwrapped subtraction gives.
    const edge = tileAt(0, -179)!
    expect(tileFraction(0, -179, edge)[0]).toBeCloseTo(1 / 18, 9)
  })

  it('names tiles so a listing sorts into the grid', () => {
    expect(tileName({ column: 0, row: 0 })).toBe('earth-detail-00-00.jpg')
    expect(tileName({ column: 19, row: 7 })).toBe('earth-detail-19-07.jpg')
  })
})
