/**
 * What the station is flying over.
 *
 * Country outlines come from Natural Earth at 1:110,000,000 (108 kB, 39 kB gzipped), the same
 * family as the coastlines already used for the globe. A point-in-polygon test against 177
 * countries answers the land case exactly.
 *
 * The sea is answered the same way, and used not to be. Ocean names came from a partition of the
 * globe by longitude and latitude, written by hand and described as approximate. It was not
 * approximate, it was wrong: the Black Sea and the Baltic came back as "Indian Ocean", the Gulf of
 * Mexico and the Caribbean as "North Pacific", the Sea of Japan as "Indian Ocean" — and the
 * station crosses the last three on most orbits. A caption that names the wrong ocean is worse
 * than one that names none, and no tuning of the cuts repairs a method with no geometry in it.
 *
 * So the sea now comes from Natural Earth's marine areas: seven ocean basins and twenty-two named
 * seas and gulfs, prepared by `npm run build:marine` (49 kB gzipped). Seas are tested before
 * basins, so the answer is the most specific one that contains the point.
 *
 * Those polygons do not tile the ocean — the Baltic, the North Sea and the Channel are in none of
 * them — and the gaps are answered "open water" rather than guessed at from a neighbour.
 */
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
// The import attribute is what lets plain Node load this module — `scripts/verify-map-alignment.mjs`
// checks the map's imagery against these polygons, and without it Node refuses the JSON outright.
import countriesTopology from 'world-atlas/countries-110m.json' with { type: 'json' }

export interface Overflight {
  /** What to show: a country, a named sea or ocean, or open water with no name in the set. */
  name: string
  /**
   * `country` and `marine` are both point-in-polygon against real outlines. `water` means no
   * polygon claimed the point — it is a gap in the marine set, not a guess.
   */
  kind: 'country' | 'marine' | 'water'
}

interface MarineArea {
  name: string
  /** 0 is an ocean basin, 1 a named sea within one. */
  rank: number
  polygons: number[][][][]
}

let marine: MarineArea[] | null = null

/*
 * Fetched as its own chunk rather than bundled into the entry.
 *
 * Measured: imported statically it landed in the entry file and put 65 kB gzipped in front of the
 * first paint, against 34 kB for the whole of the application code. Nothing on screen needs it
 * until an orbital position exists, and that waits on a network call to Celestrak — so by the time
 * there is anything to name, this has long since arrived.
 *
 * Started here at module load, never awaited by the lookup. A failure leaves an empty set, which
 * answers "open water" everywhere: the wrong amount of information, never the wrong information.
 */
export const marineReady: Promise<void> = import('../data/marine-areas.json')
  .then((module) => {
    marine = module.default as MarineArea[]
  })
  .catch(() => {
    marine = []
  })

type CountryFeature = Feature<Polygon | MultiPolygon, { name?: string }>

let countries: CountryFeature[] | null = null

/** Parsed once, on first use: the orbital view does not need it until the station has a position. */
function loadCountries(): CountryFeature[] {
  if (countries) return countries

  const topology = countriesTopology as unknown as Topology
  const converted = feature(topology, topology.objects.countries) as unknown as
    | CountryFeature
    | FeatureCollection<Polygon | MultiPolygon, { name?: string }>

  countries =
    converted.type === 'FeatureCollection' ? (converted.features as CountryFeature[]) : [converted]
  return countries
}

/**
 * Unwraps a ring's longitudes so it stays continuous past ±180°.
 *
 * Russia's easternmost tip crosses the antimeridian, and so do Fiji and Antarctica. Dropping the
 * edges that jump — the first thing one reaches for — leaves the ring open, and an open ring
 * gives the wrong parity: Chukotka came back as ocean.
 */
function unwrapRing(ring: number[][]): { points: number[][]; min: number; max: number } {
  const points: number[][] = []
  let offset = 0
  let min = Infinity
  let max = -Infinity

  for (let i = 0; i < ring.length; i += 1) {
    if (i > 0) {
      const delta = ring[i][0] - ring[i - 1][0]
      if (delta > 180) offset -= 360
      else if (delta < -180) offset += 360
    }
    const longitude = ring[i][0] + offset
    if (longitude < min) min = longitude
    if (longitude > max) max = longitude
    points.push([longitude, ring[i][1]])
  }
  return { points, min, max }
}

/**
 * Ray-casting point-in-polygon, in longitude/latitude.
 *
 * The ring is unwrapped first, and the test longitude is shifted by whole turns until it falls in
 * the ring's own range — otherwise a ring living at 170°…190° would never be matched by a point
 * reported at −175°.
 */
function pointInRing(longitude: number, latitude: number, ring: number[][]): boolean {
  const { points, min, max } = unwrapRing(ring)

  let x = longitude
  while (x < min - 180) x += 360
  while (x > max + 180) x -= 360
  if (x < min || x > max) {
    // One turn either way is all a ring can span; if it still misses, the point is outside.
    if (x + 360 >= min && x + 360 <= max) x += 360
    else if (x - 360 >= min && x - 360 <= max) x -= 360
    else return false
  }

  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const crosses = yi > latitude !== yj > latitude
    if (crosses && x < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function pointInFeature(longitude: number, latitude: number, entry: CountryFeature): boolean {
  const polygons =
    entry.geometry.type === 'MultiPolygon' ? entry.geometry.coordinates : [entry.geometry.coordinates]

  for (const polygon of polygons) {
    const [outer, ...holes] = polygon
    if (!outer || !pointInRing(longitude, latitude, outer)) continue
    // A point inside a hole — an enclave, a large lake — is not inside the country.
    if (holes.some((hole) => pointInRing(longitude, latitude, hole))) continue
    return true
  }
  return false
}

/**
 * Name of the sea at a position, or null where the marine set has nothing.
 *
 * The areas arrive sorted with the seas first, so the first polygon that contains the point is
 * already the most specific one — the Gulf of Mexico rather than the North Atlantic that encloses
 * it.
 */
function marineName(latitude: number, longitude: number): string | null {
  for (const area of marine ?? []) {
    for (const polygon of area.polygons) {
      const [outer, ...holes] = polygon
      if (!outer || !pointInRing(longitude, latitude, outer)) continue
      if (holes.some((hole) => pointInRing(longitude, latitude, hole))) continue
      return area.name
    }
  }
  return null
}

/**
 * What lies directly beneath a point on the ground, or null while the sea outlines are still
 * arriving — a caller that has nothing to say should say nothing rather than guess for a second.
 *
 * Only meaningful within about 56° of the equator. The marine set is cut to the band the station
 * can actually fly over, and both callers read a position that cannot leave it.
 */
export function overflightAt(latitude: number, longitude: number): Overflight | null {
  for (const entry of loadCountries()) {
    if (pointInFeature(longitude, latitude, entry)) {
      return { name: entry.properties?.name ?? 'Land', kind: 'country' }
    }
  }

  if (marine === null) return null

  const sea = marineName(latitude, longitude)
  if (sea) return { name: sea, kind: 'marine' }

  // Named nothing rather than named wrongly. The gaps are real water — a scatter of coastal
  // margins and the hole Natural Earth punches in the North Atlantic — and the previous version's
  // answer for them was an ocean on the far side of the planet.
  return { name: 'open water', kind: 'water' }
}
