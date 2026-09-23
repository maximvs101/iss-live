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
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
  renderSystems,
} from './lib/render-pages.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')

/**
 * The three things a crawler needs and a template can lose silently: a title, one h1, and a
 * canonical that names its own path — and enough text to be worth indexing.
 */
function checkPage(page, { heading = true } = {}) {
  const problems = []
  if (!/<title>[^<]{10,}<\/title>/.test(page.html)) problems.push('no title')
  if (heading && (page.html.match(/<h1[\s>]/g) ?? []).length !== 1) problems.push('not exactly one h1')
  if (!page.html.includes(`rel="canonical" href="${SITE}${page.path}"`)) problems.push('canonical does not match path')
  if (page.html.length < 4_000) problems.push(`only ${page.html.length} bytes`)
  if (problems.length) throw new Error(`${page.path}: ${problems.join(', ')}`)
}

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
    renderSystems({
      subsystems: SUBSYSTEMS.map((s) => ({
        id: s.id,
        label: s.label,
        tagline: s.tagline,
        channelCount: s.sections.flatMap((x) => x.channels.filter((c) => !c.hidden)).length,
      })),
      builtAt,
    }),
    renderAbout({ references, channelCount, partCount: parts.length, photographedCount, builtAt }),
  ]

  for (const page of pages) {
    checkPage(page)

    const dir = resolve(dist, `.${page.path}`)
    await mkdir(dir, { recursive: true })
    await writeFile(resolve(dir, 'index.html'), page.html)
    console.log(`${page.path.padEnd(36)} ${(page.html.length / 1024).toFixed(1).padStart(6)} kB`)
  }

  // The passes page is built by Vite, not rendered here, and gets the same checks — plus two of
  // its own: the chrome placeholders were replaced, and its chunks carry none of the heavy ones.
  const passesHtml = await readFile(resolve(dist, 'passes/index.html'), 'utf8')
  checkPage({ path: '/passes/', html: passesHtml })
  if (passesHtml.includes('<!--site-')) throw new Error('/passes/: the site header or footer was not injected')

  // The console and the home page are built by Vite too, and get the same checks.
  // The console's h1 is rendered by the application (visually hidden, the bar carries the name), not
  // written in its HTML: its page is checked for everything else.
  checkPage({ path: '/console/', html: await readFile(resolve(dist, 'console/index.html'), 'utf8') }, { heading: false })
  const homeHtml = await readFile(resolve(dist, 'index.html'), 'utf8')
  checkPage({ path: '/', html: homeHtml })
  if (homeHtml.includes('<!--site-')) throw new Error('/: the site header or footer was not injected')

  // No page may still send a part to the home page: /?part= is only there for old links.
  for (const page of [...pages, { path: '/', html: homeHtml }, { path: '/passes/', html: passesHtml }]) {
    if (page.html.includes('href="/?part=')) throw new Error(`${page.path}: links a part to /?part= instead of /console/?part=`)
  }

  const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'))
  // Which chunks an entry reaches: statically (in the first load) or at all (with dynamic imports).
  const reach = (entry, withDynamic) => {
    const seen = new Set()
    const walk = (key) => {
      if (seen.has(key) || !manifest[key]) return
      seen.add(key)
      for (const next of [...(manifest[key].imports ?? []), ...(withDynamic ? (manifest[key].dynamicImports ?? []) : [])]) {
        walk(next)
      }
    }
    walk(entry)
    return [...seen]
  }
  const named = (keys, pattern) => keys.filter((key) => pattern.test(`${key} ${manifest[key].file}`))
  // By chunk name as vite.config's codeSplitting groups them — "atlas", not "world-atlas": the group
  // chunk is named after the group, and the first version of this pattern looked for the package
  // name and let the atlas through unseen.
  const HEAVY = /three|lightstreamer|atlas|topojson|marine|StationView|draco/i

  const passesReach = reach('passes/index.html', true)
  const heavy = named(passesReach, HEAVY)
  if (heavy.length) throw new Error(`/passes/ pulls in ${heavy.join(', ')}`)
  console.log(`${'/passes/'.padEnd(36)} ${(passesHtml.length / 1024).toFixed(1).padStart(6)} kB  ${passesReach.length} chunks, none heavy`)

  // The home page's first load carries no atlas, three or Lightstreamer; its one dynamic import is
  // the place names (countries and marine areas), after the first paint — and never three or
  // Lightstreamer, at any depth.
  const homeStatic = named(reach('index.html', false), HEAVY)
  if (homeStatic.length) throw new Error(`/ loads ${homeStatic.join(', ')} up front`)
  const homeAny = named(reach('index.html', true), /three|lightstreamer|StationView|draco/i)
  if (homeAny.length) throw new Error(`/ can reach ${homeAny.join(', ')}`)
  console.log(`${'/'.padEnd(36)} ${(homeHtml.length / 1024).toFixed(1).padStart(6)} kB  ${reach('index.html', false).length} chunks up front, none heavy`)
  // The manifest is a build artefact, not something to serve.
  await rm(resolve(dist, '.vite'), { recursive: true, force: true })

  const paths = ['/', '/console/', '/passes/', ...pages.map((p) => p.path)]
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
