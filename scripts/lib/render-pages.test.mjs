/**
 * The page renderers, held to the three things a crawler needs and a template loses silently.
 *
 * Small fixtures rather than the real declarations: the build script runs the renderers over the
 * real data and checks the same invariants there, so this is about the shape of the output —
 * escaping, the canonical, the nav marking its own page, hidden channels left out — on inputs
 * chosen to break them.
 */
import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  firstSentence,
  inlineMarkdown,
  parseReferences,
  renderAbout,
  renderSitemap,
  renderStation,
  renderSubsystem,
  renderSystems,
  siteFooter,
  siteHeader,
} from './render-pages.mjs'

const subsystem = {
  id: 'eps',
  label: 'Power',
  tagline: 'Eight wings & two joints.',
  disciplines: ['SPARTAN'],
  sections: [
    {
      id: 'sarj',
      label: 'Solar alpha rotary joint',
      channels: [
        { pui: 'S0000004', label: 'Port SARJ angle', hint: "It turns once per orbit, and it's <not> fast.", part: 'sarj-port' },
        { pui: 'S0000008', label: 'Port SARJ mode', part: 'sarj-port' },
        { pui: 'TIME_000002', label: 'Year', hidden: true },
      ],
    },
  ],
}
const order = ['eps', 'eclss']
const symbols = {
  S0000004: { description: 'SARJ angle', units: 'DEG' },
  S0000008: { description: 'SARJ mode', values: { 0: 'AUTOTRACK' } },
}
const parts = {
  'sarj-port': { id: 'sarj-port', name: 'Port SARJ', designation: 'Solar Alpha Rotary Joint', category: 'power', summary: 'Turns "the port wings".' },
}

describe('escaping', () => {
  it('turns the four characters that break HTML into entities', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;\'')
  })

  it('takes the first sentence for a description, and the whole text when there is one', () => {
    expect(firstSentence('One. Two.')).toBe('One.')
    expect(firstSentence('Just this')).toBe('Just this')
  })
})

describe('a subsystem page', () => {
  const page = renderSubsystem({
    subsystem,
    order,
    unitOf: (pui) => symbols[pui]?.units ?? null,
    symbolOf: (pui) => symbols[pui],
    partOf: (id) => parts[id],
  })

  it('lives at its slug and says so in its canonical', () => {
    expect(page.path).toBe('/telemetry/power/')
    expect(page.html).toContain('rel="canonical" href="https://iss-live.pages.dev/telemetry/power/"')
  })

  it('escapes the hint and the tagline rather than trusting them', () => {
    expect(page.html).toContain("and it's &lt;not&gt; fast.")
    expect(page.html).not.toContain('<not>')
    expect(page.html).toContain('Eight wings &amp; two joints.')
  })

  it('leaves a hidden channel out, as the page does', () => {
    expect(page.html).not.toContain('TIME_000002')
    expect(page.html).toContain('S0000004')
  })

  it('lists a channel without a hint by name, and never prints the catalogue description as one', () => {
    // The catalogue's own strings are terse, sometimes misspelt and once wrong about which
    // segment a channel sits on; a blank is better than one of those dressed as an explanation.
    expect(page.html).toContain('<li id="S0000008">Port SARJ mode')
    expect(page.html).toContain('a state')
    expect(page.html).not.toContain('<dd>SARJ mode</dd>')
  })

  it('keeps the description tag short enough for a result snippet', () => {
    const description = /<meta name="description" content="([^"]*)"/.exec(page.html)[1]
    expect(description.length).toBeLessThanOrEqual(155)
    expect(description).toContain('1 of them explained')
  })

  it('names the h1 as the structured data headline', () => {
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(page.html)[1])
    expect(ld.headline).toBe('Power')
  })

  it('links the parts it mentions into the twin', () => {
    expect(page.html).toContain('href="/console/?part=sarj-port"')
    expect(page.html).toContain('Turns &quot;the port wings&quot;.')
  })

  it('marks its own entry in the nav and offers the next subsystem', () => {
    expect(page.html).toContain('<a href="/telemetry/" aria-current="true">Systems</a>')
    expect(page.html).toContain('rel="next" href="/telemetry/life-support/"')
    expect(page.html).not.toContain('rel="prev"')
  })

  it('has exactly one h1 and a JSON-LD article', () => {
    expect(page.html.match(/<h1[\s>]/g)).toHaveLength(1)
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(page.html)[1])
    expect(ld['@type']).toBe('TechArticle')
    expect(ld.url).toBe('https://iss-live.pages.dev/telemetry/power/')
  })
})

describe('the station page', () => {
  const page = renderStation({
    parts: [parts['sarj-port'], { id: 'cupola', name: 'Cupola', category: 'module', summary: 'Windows.' }],
    categoryLabels: { power: 'Power', module: 'Pressurised module' },
    reportsIn: (id) => (id === 'sarj-port' ? [{ id: 'eps', label: 'Power' }] : []),
  })

  it('groups modules first and links a part to the pages that explain it', () => {
    expect(page.html.indexOf('Pressurised module')).toBeLessThan(page.html.indexOf('id="c-power"'))
    expect(page.html).toContain('Reports in <a href="/telemetry/power/">Power</a>.')
    expect(page.html).toContain('id="cupola"')
  })

  it('refuses a part whose category the page has no place for, rather than counting it and losing it', () => {
    // The lead says "N parts" from the array and the sections come from a fixed category order:
    // a part in a category the order does not name was counted and never listed, silently.
    expect(() =>
      renderStation({
        parts: [{ id: 'quest', name: 'Quest', category: 'airlock', summary: 'The door.' }],
        categoryLabels: { airlock: 'Airlock' },
        reportsIn: () => [],
      }),
    ).toThrow(/quest.*airlock/)
  })
})

describe('the reference table', () => {
  it('reads the first markdown table and renders its links', () => {
    const md = `# Title\n\nintro\n\n| Document | What it settles |\n|---|---|\n| [Guide](https://x.example/g) (2015) | the **CMG** figures — see below |\n| plain \`code\` | *italics* & more |\n\nafter\n\n| Other | table |\n|---|---|\n| no | no |\n`
    const refs = parseReferences(md)
    expect(refs).toHaveLength(2)
    expect(refs[0].documentHtml).toBe('<a href="https://x.example/g" rel="noopener">Guide</a> (2015)')
    expect(refs[0].settlesHtml).toBe('the <strong>CMG</strong> figures')
    expect(refs[1].documentHtml).toBe('plain <code>code</code>')
    expect(refs[1].settlesHtml).toBe('<em>italics</em> &amp; more')
  })

  it('escapes what it does not understand instead of passing it through', () => {
    expect(inlineMarkdown('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('keeps a URL that carries parentheses whole', () => {
    expect(inlineMarkdown('[Foo](https://en.wikipedia.org/wiki/Foo_(bar)) and')).toBe(
      '<a href="https://en.wikipedia.org/wiki/Foo_(bar)" rel="noopener">Foo</a> and',
    )
  })

  it('drops the doc-internal "see below" from a settles cell', () => {
    const md = '| Document | What it settles |\n|---|---|\n| [A](https://a.example/) | the bus — see below |\n'
    expect(parseReferences(md)[0].settlesHtml).toBe('the bus')
  })

  it('keeps an escaped pipe inside a cell instead of cutting the cell at it', () => {
    // The doc writes `\|` sixty-nine times outside this table; the first one written inside it
    // split the row into three cells and the page showed the front half of the sentence.
    const md = '| Document | What it settles |\n|---|---|\n| Mimic | SARJ modes \\| TRRJ modes |\n'
    expect(parseReferences(md)[0].settlesHtml).toBe('SARJ modes | TRRJ modes')
  })

  it('stops the build on a row that does not have two cells', () => {
    const md = '| Document | What it settles |\n|---|---|\n| A | B | C |\n'
    expect(() => parseReferences(md)).toThrow(/three cells/)
  })
})

describe('the sitemap', () => {
  it('lists every path under the site', () => {
    expect(renderSitemap(['/', '/about/'])).toContain('<loc>https://iss-live.pages.dev/about/</loc>')
  })
})

describe('the shared chrome', () => {
  it('lists the passes page in every header and marks it on its own page', () => {
    expect(siteHeader('/about/')).toContain('<a href="/passes/">When to see it</a>')
    expect(siteHeader('/passes/')).toContain('<a href="/passes/" aria-current="page">When to see it</a>')
    expect(siteHeader('/about/')).toContain('<a class="site__brand" href="/">ISS Live</a>')
    // On the home page the bar marked nothing: the brand is its entry.
    expect(siteHeader('/')).toContain('<a class="site__brand" href="/" aria-current="page">ISS Live</a>')
    expect(siteFooter()).toContain('href="/about/"')
  })
})

describe('the about page', () => {
  it('credits GeoNames under its licence', () => {
    const page = renderAbout({ references: [], channelCount: 163, partCount: 39, photographedCount: 20 })
    expect(page.html).toContain('Six sources')
    expect(page.html).toContain('GeoNames')
    expect(page.html).toContain('CC BY 4.0')
  })
})

describe('the console links', () => {
  it('sends parts and "the console" to /console/, never to the home page', () => {
    const station = renderStation({
      parts: [parts['sarj-port']],
      categoryLabels: { power: 'Power' },
      reportsIn: () => [],
    })
    expect(station.html).toContain('href="/console/?part=sarj-port"')
    expect(station.html).not.toContain('href="/?part=')
    const power = renderSubsystem({ subsystem, order, unitOf: () => null, symbolOf: () => undefined, partOf: (id) => parts[id] })
    expect(power.html).toContain('href="/console/?part=sarj-port"')
    expect(power.html).toContain('<a href="/console/">the console</a>')
    expect(power.html).toContain('<a href="/console/">the live page</a>')
  })

  it('names the neighbouring subsystems in the pager without the old navigation list', () => {
    const power = renderSubsystem({ subsystem, order, unitOf: () => null, symbolOf: () => undefined, partOf: (id) => parts[id] })
    expect(power.html).toContain('rel="next" href="/telemetry/life-support/">Life support →</a>')
  })
})

describe('the systems page', () => {
  const page = renderSystems({
    subsystems: [
      { id: 'eps', label: 'Power', tagline: 'Eight wings & two joints.', channelCount: 30 },
      { id: 'tcs', label: 'Thermal', tagline: 'Two ammonia loops.', channelCount: 16 },
    ],
  })

  it('lives at /telemetry/ and lists every subsystem with its tagline', () => {
    expect(page.path).toBe('/telemetry/')
    expect(page.html).toContain('rel="canonical" href="https://iss-live.pages.dev/telemetry/"')
    expect(page.html).toContain('<a href="/telemetry/power/">Power</a>')
    expect(page.html).toContain('Eight wings &amp; two joints.')
    expect(page.html).toContain('<a href="/telemetry/thermal/">Thermal</a>')
    expect(page.html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(page.html).toContain('<a href="/telemetry/" aria-current="page">Systems</a>')
  })
})
