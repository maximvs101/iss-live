/**
 * Structural checks on the scene and the telemetry, without a browser or a graphics card.
 *
 * Two things are verified:
 *  1. consistency between the inventory of 3D parts and the telemetry channels attached to them;
 *  2. that every symbol cited in the code exists in the official catalogue.
 *
 * The conventions of the 3D geographic frame used to be checked here as well. They belonged to
 * the globe, which the flat map replaced; the map's own projection is covered by unit tests.
 *
 * Usage: node scripts/verify-scene.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PART_IDS } from '../src/scene/parts.ts'
import { MAPPED_PARTS } from '../src/scene/nasa/nodeMapping.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(resolve(root, relative), 'utf8')

let failures = 0
function check(label, condition, detail = '') {
  const status = condition ? 'ok  ' : 'FAIL'
  if (!condition) failures += 1
  console.log(`  [${status}] ${label}${detail ? ` — ${detail}` : ''}`)
}

console.log('\n1. Consistency of the 3D parts')
{
  // The modules are imported rather than scraped: an earlier version matched them with a regular
  // expression and quietly counted the category names as parts.
  const declared = new Set(PART_IDS)
  check('part inventory is not empty', declared.size > 20, `${declared.size} parts`)

  const subsystemsSource = read('src/telemetry/subsystems.ts')
  const referenced = new Set(
    [...subsystemsSource.matchAll(/part: '([a-z0-9-]+)'/g)].map((match) => match[1]),
  )
  const unknownParts = [...referenced].filter((part) => !declared.has(part))
  check('every part cited by telemetry exists', unknownParts.length === 0, unknownParts.join(', '))

  // Every part in the inventory must be reachable in the 3D model, otherwise it can never be
  // selected and its description is dead weight.
  const mapped = new Set(MAPPED_PARTS)
  const unreachable = [...declared].filter((part) => !mapped.has(part))
  check(
    'every inventory part is reachable in the model',
    unreachable.length === 0,
    unreachable.join(', '),
  )

  const orphanMappings = [...mapped].filter((part) => !declared.has(part))
  check('every mapped part exists in the inventory', orphanMappings.length === 0, orphanMappings.join(', '))

  const withoutTelemetry = [...declared].filter((part) => !referenced.has(part))
  console.log(
    `  [info] ${withoutTelemetry.length} parts with no telemetry attached: ${withoutTelemetry.join(', ')}`,
  )
}

console.log('\n2. Symbols cited in the code')
{
  const catalog = JSON.parse(read('src/data/pui-catalog.json'))
  const known = new Set(catalog.symbols.map((symbol) => symbol.pui))

  const sources = ['src/telemetry/subsystems.ts', 'src/scene/nasa/nodeMapping.ts', 'src/ui/OrbitPanel.tsx']
  const cited = new Set()
  for (const file of sources) {
    const content = read(file)
    for (const match of content.matchAll(/'((?:[A-Z]+\d{6,7}|TIME_\d{6}))'/g)) cited.add(match[1])
    for (const match of content.matchAll(/pui="([A-Z0-9_]+)"/g)) cited.add(match[1])
  }

  const unknown = [...cited].filter((pui) => !known.has(pui))
  check('every cited symbol is in the catalogue', unknown.length === 0, unknown.join(', '))
  console.log(`  [info] ${cited.size} distinct symbols cited, catalogue holds ${known.size}`)
}

console.log('')
if (failures > 0) {
  console.error(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('All structural checks pass.')
