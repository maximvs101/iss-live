/**
 * Writes the crawlable pages into dist/, after `vite build`.
 *
 * The declarations the pages are rendered from are TypeScript that reaches for `import.meta.env`
 * and imports JSON, so they cannot be `import`ed by node. Vite can load them the way it loads
 * them for the browser: a server in middleware mode — no port opened — hands back the evaluated
 * modules, catalogue and all, and is closed again. That is the whole reason this is a script and
 * not a Vite plugin: it needs the finished `dist/` to write into, and it wants the same data the
 * application has, not a copy parsed out of the source as text.
 *
 * Output:
 *   dist/station/index.html
 *   dist/telemetry/<subsystem>/index.html   × 6
 *   dist/about/index.html
 *   dist/sitemap.xml                         every page above, plus the root
 *
 * Usage: node scripts/build-pages.mjs            (run by `npm run build`)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import {
  SITE,
  SUBSYSTEM_SLUGS,
  parseReferences,
  renderAbout,
  renderSitemap,
  renderStation,
  renderSubsystem,
} from './lib/render-pages.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')

const vite = await createServer({
  root,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const [{ SUBSYSTEMS }, { PARTS, PART_IDS }, { getSymbol }, { resolveUnit }, { PART_CATEGORY_LABELS }, { PHOTO_QUERY }] =
    await Promise.all([
      vite.ssrLoadModule('/src/telemetry/subsystems.ts'),
      vite.ssrLoadModule('/src/scene/parts.ts'),
      vite.ssrLoadModule('/src/data/catalog.ts'),
      vite.ssrLoadModule('/src/telemetry/units.ts'),
      vite.ssrLoadModule('/src/ui/InspectorPanel.tsx'),
      vite.ssrLoadModule('/src/media/imagery.ts'),
    ])

  const parts = PART_IDS.map((id) => PARTS[id])
  const order = SUBSYSTEMS.map((s) => s.id)
  // The date the pages were built, for their `dateModified`: they change when their sources do,
  // and their sources change at a build.
  const builtAt = new Date().toISOString().slice(0, 10)
  const unitOf = (pui) => {
    // The station clock is shown as a date and a time, with no unit — `formatValue` short-circuits
    // it before any unit is resolved — and the page follows the page rather than the catalogue.
    if (pui === 'TIME_000001') return null
    const symbol = getSymbol(pui)
    return symbol ? resolveUnit(symbol) : null
  }
  // Parts with a photograph query: the others show none, on purpose, and the about page says so.
  const photographedCount = PART_IDS.filter((id) => PHOTO_QUERY[id]).length
  const partOf = (id) => PARTS[id] ?? null
  const reportsIn = (partId) =>
    SUBSYSTEMS.filter((s) =>
      s.sections.some((section) => section.channels.some((c) => c.part === partId && !c.hidden)),
    ).map((s) => ({ id: s.id, label: s.label }))
  const channelCount = new Set(SUBSYSTEMS.flatMap((s) => s.sections.flatMap((x) => x.channels.map((c) => c.pui)))).size

  const references = parseReferences(await readFile(resolve(root, 'docs/reading-the-telemetry.md'), 'utf8'))
  if (references.length < 5) {
    throw new Error(`Only ${references.length} reference(s) parsed out of docs/reading-the-telemetry.md — the table has moved or changed shape.`)
  }

  const pages = [
    renderStation({ parts, categoryLabels: PART_CATEGORY_LABELS, reportsIn, builtAt }),
    ...SUBSYSTEMS.map((subsystem) =>
      renderSubsystem({ subsystem, order, unitOf, symbolOf: getSymbol, partOf, partOrder: PART_IDS, builtAt }),
    ),
    renderAbout({ references, channelCount, partCount: parts.length, photographedCount, builtAt }),
  ]

  for (const page of pages) {
    // Every page is checked for the three things a crawler needs and a template can lose
    // silently: a title, one h1, and a canonical that names its own path.
    const problems = []
    if (!/<title>[^<]{10,}<\/title>/.test(page.html)) problems.push('no title')
    if ((page.html.match(/<h1[\s>]/g) ?? []).length !== 1) problems.push('not exactly one h1')
    if (!page.html.includes(`rel="canonical" href="${SITE}${page.path}"`)) problems.push('canonical does not match path')
    if (page.html.length < 4_000) problems.push(`only ${page.html.length} bytes`)
    if (problems.length) throw new Error(`${page.path}: ${problems.join(', ')}`)

    const dir = resolve(dist, `.${page.path}`)
    await mkdir(dir, { recursive: true })
    await writeFile(resolve(dir, 'index.html'), page.html)
    console.log(`${page.path.padEnd(36)} ${(page.html.length / 1024).toFixed(1).padStart(6)} kB`)
  }

  const paths = ['/', ...pages.map((p) => p.path)]
  await writeFile(resolve(dist, 'sitemap.xml'), renderSitemap(paths))
  console.log(`sitemap.xml                          ${paths.length} URLs`)

  // Belt and braces: every subsystem the application declares has a slug, or its page has no
  // address and the nav above points at nothing.
  for (const s of SUBSYSTEMS) {
    if (!SUBSYSTEM_SLUGS[s.id]) throw new Error(`subsystem ${s.id} has no slug in render-pages.mjs`)
  }
} finally {
  await vite.close()
}
