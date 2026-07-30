/**
 * Coastline outlines, as longitude/latitude rings.
 *
 * Natural Earth at 1:110,000,000 (55 kB), shipped with `world-atlas`. Drawn as vectors rather
 * than as a raster: crisp at any size, instant to load, and legible on the night side of the map
 * where a photographic texture would go black.
 */
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
import landTopology from 'world-atlas/land-110m.json'

/** Every land ring in the dataset, outer boundaries and holes alike. */
export function landPolygons(): Position[][] {
  const topology = landTopology as unknown as Topology
  // `land` is a GeometryCollection in this dataset, so feature() returns a feature collection
  // rather than a single feature.
  const converted = feature(topology, topology.objects.land) as
    | Feature<Polygon | MultiPolygon>
    | FeatureCollection<Polygon | MultiPolygon>

  const features: Feature<Polygon | MultiPolygon>[] =
    converted.type === 'FeatureCollection' ? converted.features : [converted]

  return features.flatMap((entry) =>
    entry.geometry.type === 'MultiPolygon'
      ? entry.geometry.coordinates.flat()
      : entry.geometry.coordinates,
  )
}
