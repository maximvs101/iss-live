/**
 * The pages a crawler can read, rendered from the same declarations the application runs on.
 *
 * The application is one document whose text lives in tooltips and hints and whose numbers change
 * every second — a search engine renders it and finds nothing to keep. These pages are what it
 * keeps: the six subsystems with every channel explained, the station module by module, and how
 * the numbers are made. Nothing here is written twice: the subsystem pages are `subsystems.ts`,
 * the station page is `parts.ts`, the reference list is `docs/reading-the-telemetry.md`, and a
 * change to any of those changes the page at the next build.
 *
 * Eight pages and not sixty-two, on purpose. A page per part was the first idea, and each part has
 * one sentence to its name: sixty-two pages of a sentence each is what search engines call thin,
 * and thin pages cost more than they earn. The channel explanations are where the writing is, and
 * they group by subsystem. The parts keep one page between them, which carries every name a
 * reader might search for and links each into the twin.
 *
 * Pure functions over plain data, so the build script can load the TypeScript through Vite and
 * a test can hand these fixtures.
 */

import { NAV, navState } from '../../src/site/nav.ts'

export const SITE = 'https://iss-live.pages.dev'

/** Subsystem id → the path it is published under. Words a reader would type, not the acronyms. */
export const SUBSYSTEM_SLUGS = {
  eps: 'power',
  eclss: 'life-support',
  tcs: 'thermal',
  gnc: 'attitude-and-orbit',
  comms: 'communications',
  cdh: 'command-and-data',
}

/** Subsystem id → the name its pager link shows. The subsystem pages' own titles, shortened as the bar had them. */
const SUBSYSTEM_NAMES = {
  eps: 'Power',
  eclss: 'Life support',
  tcs: 'Thermal',
  gnc: 'Attitude & orbit',
  comms: 'Communications',
  cdh: 'Command & data',
}

/** The order the station page lists categories in: the parts a visitor knows first. */
const CATEGORY_ORDER = ['module', 'truss', 'power', 'thermal', 'robotics', 'comms', 'science', 'platform']

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const e = escapeHtml

/** The first sentence, for a description tag; the whole text if it has only one. */
export function firstSentence(text) {
  const match = /^(.+?[.!?])(\s|$)/.exec(text.trim())
  return match ? match[1] : text.trim()
}

/**
 * A description tag's length: about 155 characters is what a result snippet shows, and a sentence
 * cut mid-word by the engine reads worse than one cut here on a word.
 */
export function clampDescription(text, max = 155) {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

// --- The frame every page shares ------------------------------------------------------------


/** The header every page wears, the passes page included — one list of pages, not two. */
export function siteHeader(path) {
  return `<header class="site">
      <a class="site__brand" href="/"${path === '/' ? ' aria-current="page"' : ''}>ISS Live</a>
      <nav class="site__nav" aria-label="Site">
        ${NAV.map((item) => {
          const state = navState(path, item.href)
          return `<a href="${item.href}"${state ? ` aria-current="${state}"` : ''}>${e(item.label)}</a>`
        }).join('\n        ')}
      </nav>
    </header>`
}

export function siteFooter() {
  return `<footer class="site__foot">
      <p>
        Every reading on <a href="/console/">the live page</a> is measured on board and broadcast publicly
        by NASA, or computed here from Celestrak's orbital elements. Nothing is invented; when a
        value is old, its age is stated. <a href="/about/">How it works</a> ·
        <a href="https://github.com/maximvs101/iss-live" rel="noopener">Source code</a>
      </p>
    </footer>`
}

/**
 * One layout for every page.
 *
 * The head carries what the application's own index carries — canonical, Open Graph, the card —
 * so a shared page unfurls the same way, plus a JSON-LD `TechArticle` that says what the page is
 * about. The stylesheet is one shared file rather than inline styles: eight pages, one download.
 */
export const CARD_ALT =
  "A dark world map with the station's ground track drawn as a green sine curve, titled ISS Live."

export function layout({ path, title, headline, description, body, jsonLd, image, builtAt }) {
  const url = `${SITE}${path}`
  const card = image ?? `${SITE}/social-card.png`
  const fullTitle = `${title} — ISS Live`
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    // The h1, not the title stem: structured data that names a heading the page does not show is
    // structured data a validator flags and a reader cannot find.
    headline: headline ?? title,
    description,
    url,
    image: card,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'ISS Live', url: `${SITE}/` },
    publisher: { '@type': 'Organization', name: 'ISS Live', url: `${SITE}/` },
    ...(builtAt ? { dateModified: builtAt } : {}),
    ...jsonLd,
  }
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#090e15" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="/pages.css" />
    <title>${e(fullTitle)}</title>
    <meta name="description" content="${e(description)}" />
    <link rel="canonical" href="${e(url)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="ISS Live" />
    <meta property="og:url" content="${e(url)}" />
    <meta property="og:title" content="${e(fullTitle)}" />
    <meta property="og:description" content="${e(description)}" />
    <meta property="og:image" content="${e(card)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${e(CARD_ALT)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${e(fullTitle)}" />
    <meta name="twitter:description" content="${e(description)}" />
    <meta name="twitter:image" content="${e(card)}" />
    <meta name="twitter:image:alt" content="${e(CARD_ALT)}" />
    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
  </head>
  <body>
    ${siteHeader(path)}
    <main class="page">
${body}
    </main>
    ${siteFooter()}
  </body>
</html>
`
}

// --- One page per subsystem ------------------------------------------------------------------

/**
 * A subsystem's channels, explained.
 *
 * Every channel the application subscribes to for this subsystem, with its label, its symbol,
 * its unit, and the explanation the tooltip carries — the writing the application has and a
 * crawler could not reach. Hidden channels are left out as they are on the page: they feed
 * another row and have no line of their own.
 *
 * `unitOf(pui)` and `symbolOf(pui)` come from the caller, which has the catalogue; `partOf(id)`
 * resolves a channel's part to its description for the "where on the station" list.
 */
export function renderSubsystem({ subsystem, order, unitOf, symbolOf, partOf, partOrder, builtAt }) {
  const slug = SUBSYSTEM_SLUGS[subsystem.id]
  const path = `/telemetry/${slug}/`
  const channels = subsystem.sections.flatMap((section) =>
    section.channels.filter((c) => !c.hidden).map((c) => ({ ...c, section: section.label })),
  )
  const explained = channels.filter((c) => c.hint).length
  /*
   * Parts in the order the station lists them, not the order the channels happen to mention them.
   *
   * By channel order the thermal page put the starboard radiator first and the port one second,
   * and the port one's summary — "the mirror-image radiator" — was written to follow the other.
   */
  const mentioned = new Set(channels.map((c) => c.part).filter(Boolean))
  const parts = (partOrder ?? [...mentioned])
    .filter((id) => mentioned.has(id))
    .map((id) => partOf(id))
    .filter(Boolean)
  const disciplines = subsystem.disciplines

  const index = order.indexOf(subsystem.id)
  const previous = index > 0 ? order[index - 1] : null
  const next = index < order.length - 1 ? order[index + 1] : null

  /*
   * Two kinds of row, and the difference is honest.
   *
   * A channel with a hint gets the hint: a sourced sentence or three, the writing this page exists
   * to expose. A channel without one gets its label, its symbol and its unit, in a compact list —
   * and NOT the catalogue's own description in the place an explanation would go. The first
   * render did that, and 129 of the 162 "explanations" were the catalogue's raw strings, including
   * "Photovolatic Control Unit ... 3B" under a row this application deliberately labels 3A because
   * the 2011 catalogue is wrong about which segment it sits on. A blank is better than a wrong
   * sentence dressed as an explanation.
   */
  const meta = (c) => {
    const symbol = symbolOf(c.pui)
    const unit = unitOf(c.pui)
    return [c.pui, unit ? `in ${unit}` : null, symbol?.values ? 'a state' : null].filter(Boolean).join(' · ')
  }
  const sections = subsystem.sections
    .map((section) => {
      const rows = section.channels.filter((c) => !c.hidden)
      if (rows.length === 0) return ''
      const withHint = rows.filter((c) => c.hint)
      const bare = rows.filter((c) => !c.hint)
      const explainedRows = withHint.length
        ? `
        <dl class="channels">
${withHint
  .map(
    (c) => `          <div class="channel" id="${e(c.pui)}">
            <dt>${e(c.label)} <span class="channel__meta">${e(meta(c))}</span></dt>
            <dd>${e(c.hint)}</dd>
          </div>`,
  )
  .join('\n')}
        </dl>`
        : ''
      const bareRows = bare.length
        ? `
        <p class="note">${withHint.length ? 'Also reported here' : 'Reported here'}, live on the console:</p>
        <ul class="bare">
${bare.map((c) => `          <li id="${e(c.pui)}">${e(c.label)} <span class="channel__meta">${e(meta(c))}</span></li>`).join('\n')}
        </ul>`
        : ''
      return `      <section class="block" aria-labelledby="s-${e(section.id)}">
        <h2 id="s-${e(section.id)}">${e(section.label)}</h2>${explainedRows}${bareRows}
      </section>`
    })
    .filter(Boolean)
    .join('\n')

  const where =
    parts.length === 0
      ? ''
      : `      <section class="block" aria-labelledby="where">
        <h2 id="where">Where it lives on the station</h2>
        <ul class="parts">
${parts
  .map(
    (p) => `          <li>
            <a class="parts__name" href="/console/?part=${e(p.id)}">${e(p.name)}</a>${p.designation ? ` <span class="parts__designation">${e(p.designation)}</span>` : ''}
            <p>${e(p.summary)}</p>
          </li>`,
  )
  .join('\n')}
        </ul>
        <p class="note">Each link opens the 3D twin on that part, with its live readings beside it.</p>
      </section>`

  const description = clampDescription(
    `${firstSentence(subsystem.tagline)} ${channels.length} of the station's public readings, ${explained} of them explained.`,
  )

  const body = `      <article>
        <p class="eyebrow">Telemetry · ${e(subsystem.label)}</p>
        <h1>${e(subsystem.label)}</h1>
        <p class="lead">${e(subsystem.tagline)}</p>
        <p class="note">${channels.length} of the station's public readings belong here — NASA's catalogue files them under ${e(disciplines.join(', '))}. They are live on <a href="/console/">the console</a>${
          explained === channels.length
            ? ', and each one is explained below.'
            : `; ${explained} of them carry an explanation below, and the rest are listed so you know what the station reports.`
        }</p>
${sections}
${where}
        <nav class="pager" aria-label="Other subsystems">
          ${previous ? `<a rel="prev" href="/telemetry/${SUBSYSTEM_SLUGS[previous]}/">← ${e(SUBSYSTEM_NAMES[previous])}</a>` : '<span></span>'}
          ${next ? `<a rel="next" href="/telemetry/${SUBSYSTEM_SLUGS[next]}/">${e(SUBSYSTEM_NAMES[next])} →</a>` : '<span></span>'}
        </nav>
      </article>`

  return {
    path,
    html: layout({
      path,
      title: `${subsystem.label} — ISS telemetry explained`,
      headline: subsystem.label,
      description,
      body,
      builtAt,
      jsonLd: {
        about: { '@type': 'Thing', name: `International Space Station ${subsystem.label.toLowerCase()} system` },
        keywords: channels.map((c) => c.label).slice(0, 30).join(', '),
      },
    }),
  }
}

// --- The station, module by module -----------------------------------------------------------

/**
 * Every part the twin names, grouped the way the inspector groups them.
 *
 * `reportsIn(id)` gives the subsystems whose channels point at this part, so a module links to
 * the pages that explain what it measures; a module with none is still here, because its name is
 * what a reader searches for.
 */
export function renderStation({ parts, categoryLabels, reportsIn, builtAt }) {
  const path = '/station/'
  // A category the order does not name has no section, and a part in it would be counted in the
  // lead — "39 parts" — and never listed. Loud, because nothing downstream would notice: the smoke
  // checks read the title, the h1 and the canonical, not the count.
  const unplaced = parts.filter((p) => !CATEGORY_ORDER.includes(p.category))
  if (unplaced.length) {
    throw new Error(
      `station page: no place for ${unplaced.map((p) => `${p.id} (${p.category})`).join(', ')} — add the category to CATEGORY_ORDER`,
    )
  }
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    label: categoryLabels[category] ?? category,
    parts: parts.filter((p) => p.category === category),
  })).filter((g) => g.parts.length > 0)

  const body = `      <article>
        <p class="eyebrow">The station</p>
        <h1>The International Space Station, module by module</h1>
        <p class="lead">${parts.length} parts the twin can name — the pressurised modules, the truss, the solar wings, the radiators, the joints. Each opens the 3D view on that part, with whatever it reports beside it.</p>
${groups
  .map(
    (g) => `      <section class="block" aria-labelledby="c-${e(g.category)}">
        <h2 id="c-${e(g.category)}">${e(g.label)}</h2>
        <ul class="parts">
${g.parts
  .map((p) => {
    const systems = reportsIn(p.id)
    return `          <li id="${e(p.id)}">
            <a class="parts__name" href="/console/?part=${e(p.id)}">${e(p.name)}</a>${p.designation ? ` <span class="parts__designation">${e(p.designation)}</span>` : ''}
            <p>${e(p.summary)}</p>${
              systems.length
                ? `
            <p class="parts__reports">Reports in ${systems.map((s) => `<a href="/telemetry/${SUBSYSTEM_SLUGS[s.id]}/">${e(s.label)}</a>`).join(', ')}.</p>`
                : ''
            }
          </li>`
  })
  .join('\n')}
        </ul>
      </section>`,
  )
  .join('\n')}
      </article>`

  return {
    path,
    html: layout({
      path,
      title: 'The station, module by module',
      headline: 'The International Space Station, module by module',
      description: clampDescription(
        `${parts.length} parts of the International Space Station, named and described: modules, truss segments, solar wings, radiators and joints, each linked into a live 3D twin.`,
      ),
      body,
      builtAt,
      jsonLd: { about: { '@type': 'Thing', name: 'International Space Station' } },
    }),
  }
}

// --- The six subsystems, on one page ---------------------------------------------------------

/**
 * Where "Systems" in the bar leads: the six subsystem pages, each with its one-line tagline.
 *
 * It replaced six entries in the navigation, so it has to do what they did — get a reader to a
 * subsystem in one click — and it is one more page a search engine can read about the station.
 */
export function renderSystems({ subsystems, builtAt }) {
  const path = '/telemetry/'
  const total = subsystems.reduce((n, s) => n + s.channelCount, 0)
  const body = `      <article>
        <p class="eyebrow">Systems</p>
        <h1>How the station works, system by system</h1>
        <p class="lead">Six systems keep the International Space Station powered, breathable, cool, pointed and in touch. Each page below explains every reading the station publishes for it — ${total} in all — and each reading is live on <a href="/console/">the console</a>.</p>
        <ul class="parts">
${subsystems
  .map(
    (s) => `          <li>
            <span class="parts__name"><a href="/telemetry/${SUBSYSTEM_SLUGS[s.id]}/">${e(s.label)}</a></span> <span class="parts__designation">${s.channelCount} readings</span>
            <p>${e(s.tagline)}</p>
          </li>`,
  )
  .join('\n')}
        </ul>
      </article>`
  return {
    path,
    html: layout({
      path,
      title: 'How the station works, system by system',
      headline: 'How the station works, system by system',
      description: clampDescription(
        'Power, life support, thermal control, attitude, communications and the onboard computers of the International Space Station — every public reading explained.',
      ),
      body,
      builtAt,
      jsonLd: { about: { '@type': 'Thing', name: 'International Space Station' } },
    }),
  }
}

// --- How it works ------------------------------------------------------------------------------

/**
 * Where the numbers come from, for a reader who has just asked "says who?".
 *
 * The prose is written here; the reference list is not — it is parsed out of
 * `docs/reading-the-telemetry.md`, which is where those documents are kept and argued over, so the
 * page cannot drift from the doc.
 */
export function renderAbout({ references, channelCount, partCount, photographedCount, builtAt }) {
  const path = '/about/'
  const body = `      <article>
        <p class="eyebrow">How it works</p>
        <h1>Where the numbers come from</h1>
        <p class="lead">ISS Live is a static page. Nothing runs on a server: your browser opens NASA's public telemetry broadcast directly, computes the station's position itself, and draws what it gets. There is no account, no key, and no value invented when one is missing.</p>

        <section class="block" aria-labelledby="sources">
          <h2 id="sources">Six sources</h2>
          <dl class="channels">
            <div class="channel"><dt>NASA public telemetry, through Lightstreamer</dt><dd>${channelCount} readings — power, life support, thermal, attitude, communications, onboard computers — pushed to the browser over a WebSocket from <code>push.lightstreamer.com</code>, adapter set <code>ISSLIVE</code>. The same broadcast that NASA's ISSLive! site used and that Lightstreamer's reference client still reads. It comes and goes: the broadcast has been silent for days at a time, and the page says so rather than showing yesterday's numbers as today's.</dd></div>
            <div class="channel"><dt>Celestrak, orbital elements for NORAD object 25544</dt><dd>The station's position, speed, altitude and the solar beta angle are computed in the browser by SGP4 propagation of these elements. Checked once against an independent service that propagates its own elements, the position came within a kilometre on the ground — which is why the coordinates stop at two decimals, and why the map keeps working when the telemetry does not.</dd></div>
            <div class="channel"><dt>NASA 3D Resources</dt><dd>The 3D model is NASA's IGOAL build of the station, structured by module and by joint, prepared once into a compressed file. Its rotary joints and solar-wing gimbals are driven by the telemetry, so the wings on screen turn the way the real ones report turning.</dd></div>
            <div class="channel"><dt>NASA Image and Video Library</dt><dd>For ${photographedCount} of the ${partCount} parts, a photograph searched by title from NASA's public archive, with its credit and its date. The rest — the rotary joints, most stowage platforms, a few antennas — have no photograph that shows them and would be misrepresented by one that does not; they show none.</dd></div>
            <div class="channel"><dt>Natural Earth</dt><dd>The coastlines on the map, at 1:110,000,000, and the marine areas that name what the station is over — "the Coral Sea", "the Mozambique Channel" — by point-in-polygon against real outlines rather than a table of guesses.</dd></div>
            <div class="channel"><dt>GeoNames, cities of more than 50,000 people</dt><dd>The place names and time zones behind the city search on <a href="/passes/">when to see the ISS</a>, from <a href="https://www.geonames.org/" rel="noopener">geonames.org</a> under <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>. Only the letter being typed is fetched, and no position leaves the browser.</dd></div>
          </dl>
        </section>

        <section class="block" aria-labelledby="ages">
          <h2 id="ages">Why every value has an age</h2>
          <p>The broadcast re-sends whatever it likes whenever it likes. A reading can arrive a second ago and carry a measurement taken weeks earlier — several sensors have done exactly that for a month. So the age shown beside a value is read from the <em>station's own clock</em> wherever the station provides one, never from when the packet landed. (Eight channels — the array drive currents, which publish nothing but zero — carry no timestamp at all; for those, arrival is all there is, and the page says they are not working.) The age means one of two things:</p>
          <dl class="channels">
            <div class="channel"><dt>On a measurement</dt><dd>how long since the sensor last produced a number. Past a day, the reading is marked as stopped: it is a memory, not a measurement, and comparing it with a live one compares two moments rather than two sensors.</dd></div>
            <div class="channel"><dt>On a state</dt><dd>how long since it last changed. A computer that has reported the same mode for a month is working, and the page says "unchanged since", not "stale".</dd></div>
          </dl>
          <p>A zero from a channel that cannot physically read zero — cabin pressure, the station's mass — is a fault of the broadcast, not of the station, and is not shown.</p>
        </section>

        <section class="block" aria-labelledby="station">
          <h2 id="station">The station itself</h2>
          <p>The twin names ${partCount} parts. <a href="/station/">The station, module by module</a> lists them all, and each of the six subsystem pages — <a href="/telemetry/power/">power</a>, <a href="/telemetry/life-support/">life support</a>, <a href="/telemetry/thermal/">thermal</a>, <a href="/telemetry/attitude-and-orbit/">attitude and orbit</a>, <a href="/telemetry/communications/">communications</a>, <a href="/telemetry/command-and-data/">command and data</a> — explains every reading it publishes.</p>
        </section>

        <section class="block" aria-labelledby="refs">
          <h2 id="refs">What settles what a symbol means</h2>
          <p>NASA's catalogue names its symbols — this site subscribes to ${channelCount} of them — but does not say how to read them. These documents do, and every explanation on this site can be traced to one of them.</p>
          <table class="refs">
            <thead><tr><th scope="col">Document</th><th scope="col">What it settles</th></tr></thead>
            <tbody>
${references.map((r) => `              <tr><td>${r.documentHtml}</td><td>${r.settlesHtml}</td></tr>`).join('\n')}
            </tbody>
          </table>
        </section>

        <section class="block" aria-labelledby="code">
          <h2 id="code">The code</h2>
          <p>Everything is open: <a href="https://github.com/maximvs101/iss-live" rel="noopener">github.com/maximvs101/iss-live</a>. The repository carries the reasoning behind each decision, the scripts that verify the readings against independent sources, and the record of what was measured rather than assumed.</p>
        </section>
      </article>`

  return {
    path,
    html: layout({
      path,
      title: 'How it works',
      headline: 'Where the numbers come from',
      description: clampDescription(
        `Where ISS Live's numbers come from: NASA's public telemetry, Celestrak's orbital elements propagated with SGP4, NASA's 3D model and image library — and why every value carries an age.`,
      ),
      body,
      builtAt,
      jsonLd: { about: { '@type': 'Thing', name: 'ISS Live' } },
    }),
  }
}

// --- The sitemap, from the pages that exist ---------------------------------------------------

export function renderSitemap(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${e(SITE + p)}</loc></url>`).join('\n')}
</urlset>
`
}

// --- Inline markdown, for the reference table only --------------------------------------------

/**
 * The little markdown the reference table uses: links, bold, italics, code. Not a markdown
 * parser — this is the exact subset that table is written in, and anything else passes through
 * escaped, which is the safe failure.
 */
export function inlineMarkdown(text) {
  let out = escapeHtml(text)
  // A URL may carry one level of parentheses — `/wiki/Foo_(bar)` — and must not be cut at them.
  out = out.replace(
    /\[([^\]]+)\]\((https?:(?:[^()\s]|\([^()\s]*\))+)\)/g,
    (_, label, href) => `<a href="${href}" rel="noopener">${label}</a>`,
  )
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return out
}

/**
 * The reference table out of `docs/reading-the-telemetry.md`: the first markdown table in the
 * file, two columns, header row skipped.
 */
export function parseReferences(markdown) {
  const rows = []
  let inTable = false
  for (const line of markdown.split('\n')) {
    const isRow = /^\|.*\|\s*$/.test(line)
    if (!isRow) {
      if (inTable) break
      continue
    }
    inTable = true
    // Split on the pipes that are cell walls, not on a `\|` written inside a cell: the doc uses
    // that escape sixty-nine times outside this table, and the first one inside it cut a sentence
    // in half without a word from the build. The escape is undone once the walls are known.
    const cells = line
      .slice(1, line.lastIndexOf('|'))
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|'))
    if (/^-+$/.test(cells[0]) || cells[0] === 'Document') continue
    if (cells.length !== 2) {
      const count = ['no', 'one', 'two', 'three', 'four'][cells.length] ?? String(cells.length)
      throw new Error(`reference table: a row has ${count} cells, not two — ${line.slice(0, 80)}`)
    }
    // The doc points at its own following paragraphs with "— see below"; the page has no below.
    const settles = cells[1].replace(/\s*—\s*see below\s*$/, '')
    rows.push({ documentHtml: inlineMarkdown(cells[0]), settlesHtml: inlineMarkdown(settles) })
  }
  return rows
}
