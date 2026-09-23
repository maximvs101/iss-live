/**
 * The pass finder, held against an implementation it shares nothing with.
 *
 * Skyfield propagates with the reference `sgp4` library, takes the Sun from JPL's DE421 and finds
 * rises and sets with its own root-finder. Agreement to seconds between the two says the page's
 * times are right; agreement with itself would say nothing.
 *
 * Usage: npm run verify:passes -- [iss.tle]   (default: Celestrak's current set)
 * Needs Python with Skyfield (`python -m pip install skyfield`); DE421 is fetched into .cache/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { twoline2satrec } from 'satellite.js'
import { findPasses, positionFrom } from '../src/passes/findPasses.ts'

const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle'
const SITES = [
  { name: 'Paris', latitude: 48.86, longitude: 2.35 },
  { name: 'Tromso', latitude: 69.65, longitude: 18.96 },
  { name: 'Quito', latitude: -0.23, longitude: -78.52 },
  { name: 'Ushuaia', latitude: -54.8, longitude: -68.3 },
  { name: 'Tokyo', latitude: 35.69, longitude: 139.69 },
  { name: 'Honolulu', latitude: 21.31, longitude: -157.86 },
]
const DAYS = 5

const tleFile = process.argv[2]
const text = tleFile ? readFileSync(tleFile, 'utf8') : await (await fetch(CELESTRAK)).text()
const lines = text.trim().split('\n').map((l) => l.trim())
const line1 = lines.find((l) => l.startsWith('1 25544'))
const line2 = lines.find((l) => l.startsWith('2 25544'))
if (!line1 || !line2) {
  console.error(`no ISS element set in ${tleFile ?? CELESTRAK}; save one to a file and pass it`)
  process.exit(2)
}

const from = new Date()
from.setUTCSeconds(0, 0)
const to = new Date(from.getTime() + DAYS * 86_400_000)
const position = positionFrom(twoline2satrec(line1, line2))

const out = {
  line1,
  line2,
  from: from.toISOString(),
  to: to.toISOString(),
  sites: SITES.map((site) => ({
    ...site,
    // Only passes wholly inside the window: the two finders treat its edges differently.
    passes: findPasses(position, site, from, DAYS)
      .filter((p) => p.rise.date >= from && p.set.date <= to)
      .map((p) => ({
        rise: p.rise.date.toISOString(),
        culmination: p.culmination.date.toISOString(),
        set: p.set.date.toISOString(),
        maxElevation: p.culmination.elevation,
        visible: p.visible !== null,
        // The times a visitor actually reads, and the calendar gets.
        visibleStart: p.visible?.start.date.toISOString() ?? null,
        visibleEnd: p.visible?.end.date.toISOString() ?? null,
        reason: p.reason,
      })),
  })),
}

mkdirSync('.cache', { recursive: true })
writeFileSync('.cache/passes.json', JSON.stringify(out, null, 1))
const run = spawnSync('python', ['scripts/verify_passes.py', '.cache/passes.json'], { stdio: 'inherit' })
process.exit(run.status ?? 1)
