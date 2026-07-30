/**
 * What the station is flying over.
 *
 * Country outlines come from Natural Earth at 1:110,000,000 (108 kB, 39 kB gzipped), the same
 * family as the coastlines already used for the globe. A point-in-polygon test against 177
 * countries answers the land case exactly.
 *
 * The sea is a different matter: there is no ocean geometry in that dataset, and adding one for
 * a caption would cost more than it is worth. Ocean names are therefore assigned by region — a
 * coarse division by longitude and latitude, accurate enough to say "South Pacific" but not to
 * name a sea. The distinction is stated in the returned value so the interface can be honest
 * about which it is.
 */
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
// The import attribute is what lets plain Node load this module — `scripts/verify-map-alignment.mjs`
// checks the map's imagery against these polygons, and without it Node refuses the JSON outright.
import countriesTopology from 'world-atlas/countries-110m.json' with { type: 'json' }

export interface Overflight {
  /** What to show: a country name, or the name of a stretch of ocean. */
  name: string
  /** `country` is exact; `ocean` is a regional approximation. */
  kind: 'country' | 'ocean'
}

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
 * Name of the stretch of ocean at a position.
 *
 * Boundaries are conventional and deliberately coarse. The poles come first because they cut
 * across every longitude; the rest divides the globe into the three great ocean basins.
 */
function oceanName(latitude: number, longitude: number): string {
  if (latitude > 66) return 'Arctic Ocean'
  if (latitude < -60) return 'Southern Ocean'

  const north = latitude >= 0
  // The Americas separate Pacific from Atlantic; Africa and Australia bracket the Indian Ocean.
  if (longitude >= 20 && longitude < 147) return 'Indian Ocean'
  if (longitude >= 147 || longitude < -70) return north ? 'North Pacific' : 'South Pacific'
  return north ? 'North Atlantic' : 'South Atlantic'
}

/** What lies directly beneath a point on the ground. */
export function overflightAt(latitude: number, longitude: number): Overflight {
  for (const entry of loadCountries()) {
    if (pointInFeature(longitude, latitude, entry)) {
      return { name: entry.properties?.name ?? 'Land', kind: 'country' }
    }
  }
  return { name: oceanName(latitude, longitude), kind: 'ocean' }
}
