/**
 * The home page's world map, drawn once: the Natural Earth 1:110m land the console map uses, as a
 * static SVG in public/. The page adds only the station and its track, so a first visit downloads
 * no atlas and computes no coastline. Rerun when the outline source changes.
 *
 * Usage: npm run build:home-map
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { landPath } from './lib/world-paths.mjs'

const require = createRequire(import.meta.url)
const { feature } = require('topojson-client')
const topology = require('world-atlas/land-110m.json')

const land = feature(topology, topology.objects.land)
const features = land.type === 'FeatureCollection' ? land.features : [land]
const rings = features.flatMap((f) =>
  f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates,
)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180" preserveAspectRatio="none"><rect width="360" height="180" fill="#0a1622"/><path d="${landPath(rings, 360, 180)}" fill="#111e28" stroke="#31536b" stroke-width="0.35" stroke-linejoin="round"/></svg>\n`
writeFileSync(new URL('../public/home-map.svg', import.meta.url), svg)
console.log(`public/home-map.svg  ${(svg.length / 1024).toFixed(1)} kB, ${rings.length} rings`)
