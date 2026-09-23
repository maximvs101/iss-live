# Accueil, navigation commune et console allégée — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une page d'accueil à `/` qui dit où est la station et quand la voir, une barre de navigation commune à tout le site, la console déplacée à `/console/` avec une colonne de droite repliable.

**Architecture:** Trois entrées Vite — `index.html` (accueil), `console/index.html` (la console actuelle, déplacée), `passes/index.html`. La liste des entrées de la barre vit dans un seul module TypeScript (`src/site/nav.ts`) lu par les pages rendues au build et par la console React. L'accueil porte son texte en dur ; une petite application React calcule la position, la trace et le prochain passage avec les modules d'orbite et de passages existants ; la carte du monde est un SVG dessiné une fois au build ; le nom du lieu survolé est chargé après coup ; l'état de la diffusion NASA vient d'un nouveau point d'accès `/status` du Worker collecteur.

**Tech Stack:** TypeScript, React 19, Vite 8 (multi-page), satellite.js 7, Vitest 4 (+ jsdom, Testing Library), Node 24 (scripts `.mjs` important du `.ts`), Cloudflare Worker + D1 (le collecteur existant).

**Spec:** `docs/superpowers/specs/2026-09-23-home-and-navigation-design.md` — à lire avec ce plan.

## Global Constraints

- Interface en anglais, apostrophe typographique ’ dans les textes affichés ; commentaires de code en anglais, explicatifs (le *pourquoi*), dans le style du dépôt.
- Messages de commit en français sans accents, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Barre : `ISS LIVE` → `/` · Console → `/console/` · When to see it → `/passes/` · The station → `/station/` · Systems → `/telemetry/` · How it works → `/about/`. Pas de menu caché. Entrée exacte : `aria-current="page"` ; page d'une section (un sous-système sous Systems) : `aria-current="true"`.
- Liens de pièce : `/console/?part=<id>` ; `/?part=<id>` redirigé par script vers `/console/?part=<id>` en gardant le reste de la requête et le fragment.
- Accueil : premier chargement ≈ 100 ko ; ni three.js, ni Lightstreamer, ni l'atlas dans ses imports statiques ; seuls `overflight` et ses données (atlas des pays, zones marines) en import dynamique.
- Console : carte, vue 3D, bandeau, lectures et leurs dimensions inchangés. Orbite/Inspecteur toujours ouvert ; Fraîcheur et Prochaine orbite en `<details>` fermés par défaut, état mémorisé (`localStorage`, accès protégés).
- `/status` du Worker : `{ live, lastLive, checkedAt }` ; `live` = poussées reçues dans les 10 dernières minutes ; `Access-Control-Allow-Origin: https://iss-live.pages.dev` ; `Cache-Control: public, max-age=60`.
- Aucun déploiement (Worker, D1 ou site) sans accord explicite de l'utilisateur ; le Worker avant le site.
- Rien de NASA DOUG.

## Review Focus

1. **Anciens liens de pièce avec d'autres paramètres ou un fragment** — `/?part=cupola&x=1#y` doit arriver sur `/console/?part=cupola&x=1#y`, et `/?utm=…` sans `part` ne doit pas partir. Test : Task 2, « keeps the rest of the address ».
2. **Point d'accès `/status` lent, en panne ou qui répond n'importe quoi** — la ligne NASA disparaît, rien d'autre ne casse. Test : Task 6, « gives up on a slow or malformed answer ».
3. **Module des noms de lieu qui ne se charge pas** — la position reste en coordonnées, sans erreur. Test : Task 8, « keeps the coordinates when the place names cannot load ».
4. **Ville mémorisée illisible, inconnue, ou position géolocalisée** — l'accueil propose `/passes/` ou donne le passage pour « your location », jamais d'écran cassé. Test : Task 5.
5. **Stockage bloqué pour les blocs repliables** — la console s'affiche, blocs fermés, sans erreur. Test : Task 3, « works with storage blocked ».

---

## File map

| Fichier | Responsabilité | Task |
|---|---|---|
| `src/site/nav.ts` (+ test) | la liste unique des entrées, et quelle entrée est courante | 1 |
| `scripts/lib/render-pages.mjs` (+ test) | barre depuis `nav.ts`, pager, liens `/console/`, page `/telemetry/` | 1 |
| `scripts/build-pages.mjs` | rend `/telemetry/`, contrôle `/`, `/console/`, `/telemetry/`, graphe de l'accueil, sitemap | 1, 2, 8 |
| `console/index.html` (déplacé depuis `index.html`) | la console | 2 |
| `index.html` (nouveau), `src/home/main.tsx` | la coquille de l'accueil, redirection des anciens liens | 2, 8 |
| `src/home/redirect.test.ts` | la redirection, sur le script tel que dans la page | 2 |
| `src/ui/SiteNav.tsx` (+ test), `src/App.tsx`, `src/App.css` | la barre dans la console ; `SiteFooter` supprimé | 2 |
| `vite.config.ts`, `public/_headers`, `passes/index.html` | entrées, chrome, cache, liens | 2 |
| `src/ui/useFold.ts` (+ test), `src/ui/FreshnessPanel.tsx`, `src/ui/charts/OrbitProfile.tsx` | blocs repliables mémorisés | 3 |
| `src/orbit/overflight.ts`, `src/ui/NowOver.tsx`, `src/home/position.ts` (+ tests) | libellé du lieu partagé, lignes de position | 4 |
| `src/home/nextPass.ts` (+ test), `src/passes/findPasses.ts`, `src/passes/PassesApp.tsx` | prochain passage depuis la ville mémorisée | 5 |
| `worker/src/status.js` (+ test), `worker/src/index.js`, `worker/schema.sql`, `src/home/status.ts` (+ test) | état de la diffusion | 6 |
| `scripts/build-home-map.mjs`, `scripts/lib/world-paths.mjs` (+ test), `public/home-map.svg`, `src/home/HomeMap.tsx` | la carte | 7 |
| `src/home/HomeApp.tsx` (+ test), `src/home/home.css` | l'accueil assemblé | 8 |
| `docs/architecture.md`, `docs/home-verification.md` | mesures et documentation | 9 |

---

### Task 1: Une seule liste de navigation, et la page `/telemetry/`

**Files:**
- Create: `src/site/nav.ts`, `src/site/nav.test.ts`
- Modify: `scripts/lib/render-pages.mjs` (NAV, `siteHeader`, pager, liens `/?part=` et `href="/"`, nouvelle `renderSystems`), `scripts/lib/render-pages.test.mjs`, `scripts/build-pages.mjs` (rendre `/telemetry/`)

**Interfaces:**
- Produces: `interface NavItem { href: string; label: string }` ; `NAV: readonly NavItem[]` ; `navState(path: string, href: string): 'page' | 'true' | undefined` ; `renderSystems({ subsystems, builtAt }): { path: '/telemetry/', html: string }` où `subsystems: { id: string; label: string; tagline: string; channelCount: number }[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/site/nav.test.ts
import { describe, expect, it } from 'vitest'
import { NAV, navState } from './nav.ts'

describe('the site navigation', () => {
  it('has the five entries, in order', () => {
    expect(NAV.map((i) => i.href)).toEqual(['/console/', '/passes/', '/station/', '/telemetry/', '/about/'])
    expect(NAV.map((i) => i.label)).toEqual(['Console', 'When to see it', 'The station', 'Systems', 'How it works'])
  })

  it('marks the page itself, and the section a subsystem page belongs to', () => {
    expect(navState('/passes/', '/passes/')).toBe('page')
    expect(navState('/telemetry/', '/telemetry/')).toBe('page')
    expect(navState('/telemetry/power/', '/telemetry/')).toBe('true')
    expect(navState('/telemetry/power/', '/passes/')).toBeUndefined()
    expect(navState('/', '/console/')).toBeUndefined()
  })
})
```

In `scripts/lib/render-pages.test.mjs`: add `renderSystems` to the import list; replace the test `'marks its own entry in the nav and offers the next subsystem'` body's first assertion `expect(page.html).toContain('href="/telemetry/power/" aria-current="page"')` with `expect(page.html).toContain('<a href="/telemetry/" aria-current="true">Systems</a>')`; in `'lists the passes page in every header…'` replace the two `Passes` assertions by:

```js
    expect(siteHeader('/about/')).toContain('<a href="/passes/">When to see it</a>')
    expect(siteHeader('/passes/')).toContain('<a href="/passes/" aria-current="page">When to see it</a>')
    expect(siteHeader('/about/')).toContain('<a class="site__brand" href="/">ISS Live</a>')
```

and append:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/site/nav.test.ts scripts/lib/render-pages.test.mjs`
Expected: FAIL — `./nav.ts` not found; `renderSystems` not exported; old links.

- [ ] **Step 3: Write `src/site/nav.ts`**

```ts
/**
 * The site's navigation, once.
 *
 * Read by the pages rendered at build time (scripts/lib/render-pages.mjs imports this file
 * directly, as the scripts already import TypeScript) and by the console, which is a React
 * application: one list, so that a page added to one bar cannot be missing from the other.
 *
 * Five entries, not the nine the rendered pages carried: the six subsystems sit behind Systems,
 * which has its own page. Nine short links took three rows on a phone.
 */
export interface NavItem {
  href: string
  label: string
}

export const NAV: readonly NavItem[] = [
  { href: '/console/', label: 'Console' },
  { href: '/passes/', label: 'When to see it' },
  { href: '/station/', label: 'The station' },
  { href: '/telemetry/', label: 'Systems' },
  { href: '/about/', label: 'How it works' },
]

/**
 * `aria-current` for an entry: "page" on the page itself, "true" on a page inside the entry's
 * section — a subsystem page is not the Systems page, but it is where Systems leads.
 */
export function navState(path: string, href: string): 'page' | 'true' | undefined {
  if (path === href) return 'page'
  if (href === '/telemetry/' && path.startsWith('/telemetry/')) return 'true'
  return undefined
}
```

- [ ] **Step 4: Rework `scripts/lib/render-pages.mjs`**

1. Delete the local `const NAV = [...]` array. Add at the top of the imports: `import { NAV, navState } from '../../src/site/nav.ts'`.
2. Add, after `SUBSYSTEM_SLUGS`, the names the pager needs (they used to be read out of the old NAV):

```js
/** Subsystem id → the name its pager link shows. The subsystem pages' own titles, shortened as the bar had them. */
const SUBSYSTEM_NAMES = {
  eps: 'Power',
  eclss: 'Life support',
  tcs: 'Thermal',
  gnc: 'Attitude & orbit',
  comms: 'Communications',
  cdh: 'Command & data',
}
```

3. Replace `siteHeader` with:

```js
export function siteHeader(path) {
  return `<header class="site">
      <a class="site__brand" href="/">ISS Live</a>
      <nav class="site__nav" aria-label="Site">
        ${NAV.map((item) => {
          const state = navState(path, item.href)
          return `<a href="${item.href}"${state ? ` aria-current="${state}"` : ''}>${e(item.label)}</a>`
        }).join('\n        ')}
      </nav>
    </header>`
}
```

4. In `siteFooter`, change `<a href="/">the live page</a>` to `<a href="/console/">the live page</a>`.
5. In `renderSubsystem`: change `They are live on <a href="/">the console</a>` to `They are live on <a href="/console/">the console</a>`; change the two pager expressions `e(NAV.find((n) => n.href.includes(SUBSYSTEM_SLUGS[previous])).label)` and `…[next]…` to `e(SUBSYSTEM_NAMES[previous])` and `e(SUBSYSTEM_NAMES[next])`.
6. Replace both `href="/?part=${e(p.id)}"` (in `renderSubsystem` and `renderStation`) with `href="/console/?part=${e(p.id)}"`.
7. Add the systems page, after `renderStation`:

```js
// --- The six subsystems, on one page ---------------------------------------------------------

/**
 * Where "Systems" in the bar leads: the six subsystem pages, each with its one-line tagline.
 *
 * It replaced six entries in the navigation, so it has to do what they did — get a reader to a
 * subsystem in one click — and it is one more page a search engine can read about the station.
 */
export function renderSystems({ subsystems, builtAt }) {
  const path = '/telemetry/'
  const body = `      <article>
        <p class="eyebrow">Systems</p>
        <h1>How the station works, system by system</h1>
        <p class="lead">Six systems keep the International Space Station powered, breathable, cool, pointed and in touch. Each page below explains every reading the station publishes for it — ${subsystems.reduce((n, s) => n + s.channelCount, 0)} in all — and each reading is live on <a href="/console/">the console</a>.</p>
        <ul class="parts">
${subsystems
  .map(
    (s) => `          <li>
            <a class="parts__name" href="/telemetry/${SUBSYSTEM_SLUGS[s.id]}/">${e(s.label)}</a> <span class="parts__designation">${s.channelCount} readings</span>
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
```

Note: the `<a>` for a subsystem inside `renderSystems` is written `<a class="parts__name" href=…>`; the test expects `<a href="/telemetry/power/">Power</a>` — write the link as `<a href="/telemetry/${SUBSYSTEM_SLUGS[s.id]}/">${e(s.label)}</a>` wrapped in `<span class="parts__name">…</span>` so both the class and the test hold:

```js
            <span class="parts__name"><a href="/telemetry/${SUBSYSTEM_SLUGS[s.id]}/">${e(s.label)}</a></span> <span class="parts__designation">${s.channelCount} readings</span>
```

- [ ] **Step 5: Render the page in `scripts/build-pages.mjs`**

Add `renderSystems` to the import from `./lib/render-pages.mjs`, and in the `pages` array, after the subsystem pages:

```js
    renderSystems({
      subsystems: SUBSYSTEMS.map((s) => ({
        id: s.id,
        label: s.label,
        tagline: s.tagline,
        channelCount: s.sections.flatMap((x) => x.channels.filter((c) => !c.hidden)).length,
      })),
      builtAt,
    }),
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/site/nav.test.ts scripts/lib/render-pages.test.mjs`
Expected: PASS (all, old and new). Then `npm run build:pages` after `npx vite build`: expected a line `/telemetry/   … kB`.

- [ ] **Step 7: Commit**

```bash
git add src/site/nav.ts src/site/nav.test.ts scripts/lib/render-pages.mjs scripts/lib/render-pages.test.mjs scripts/build-pages.mjs
git commit -F - <<'EOF'
Une seule liste de navigation pour tout le site, et une page /telemetry/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: La console passe à `/console/`, l'accueil prend `/`

**Files:**
- Move: `index.html` → `console/index.html` (`git mv`), then edit
- Create: `index.html` (coquille de l'accueil), `src/home/main.tsx`, `src/home/redirect.test.ts`, `src/ui/SiteNav.tsx`, `src/ui/SiteNav.test.tsx`
- Modify: `vite.config.ts`, `src/App.tsx`, `src/App.css`, `public/_headers`, `passes/index.html`, `scripts/build-pages.mjs`
- Delete: `src/ui/SiteFooter.tsx`

**Interfaces:**
- Consumes: `NAV`, `navState` (Task 1).
- Produces: `SiteNav({ path }: { path: string })` ; `dist/console/index.html` ; `dist/index.html` (accueil) ; the `#home-app` mount point and `#home-where` h1 line that Task 8 fills.

- [ ] **Step 1: Write the failing tests**

```ts
// src/home/redirect.test.ts
// @vitest-environment jsdom
/**
 * The first script in the home page's head, run as the browser runs it. It sends links from when
 * the console was the home page — /?part=cupola, in bookmarks, shares and search results — to the
 * console, before anything is drawn. Cloudflare Pages cannot redirect on a query parameter.
 */
import { describe, expect, it, vi } from 'vitest'
import html from '../../index.html?raw'

const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]
function visit(search: string, hash = '') {
  const location = { search, hash, replace: vi.fn() }
  new Function('location', script)(location)
  return location.replace
}

describe('the old part links', () => {
  it('go to the console with their part', () => {
    expect(visit('?part=cupola')).toHaveBeenCalledWith('/console/?part=cupola')
  })

  // Review focus 1
  it('keeps the rest of the address', () => {
    expect(visit('?part=cupola&x=1', '#y')).toHaveBeenCalledWith('/console/?part=cupola&x=1#y')
  })

  it('leaves the home page alone without a part', () => {
    expect(visit('')).not.toHaveBeenCalled()
    expect(visit('?utm_source=x')).not.toHaveBeenCalled()
    expect(visit('?partner=1')).not.toHaveBeenCalled()
  })
})
```

```tsx
// src/ui/SiteNav.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SiteNav } from './SiteNav'

afterEach(cleanup)

describe('SiteNav', () => {
  it('draws the same five entries as the rendered pages, and marks the console', () => {
    render(<SiteNav path="/console/" />)
    const nav = screen.getByRole('navigation', { name: 'Site' })
    const links = [...nav.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent])
    expect(links).toEqual([
      ['/', 'ISS Live'],
      ['/console/', 'Console'],
      ['/passes/', 'When to see it'],
      ['/station/', 'The station'],
      ['/telemetry/', 'Systems'],
      ['/about/', 'How it works'],
    ])
    expect(screen.getByRole('link', { name: 'Console' }).getAttribute('aria-current')).toBe('page')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/home/redirect.test.ts src/ui/SiteNav.test.tsx`
Expected: FAIL — the current `index.html` has no inline script (the regex finds nothing); `./SiteNav` not found.

- [ ] **Step 3: Move the console**

Run: `git mv index.html console/index.html`

Edit `console/index.html`:
- `<title>` → `ISS Live — the live console: telemetry, orbit and the station in 3D`
- `<link rel="canonical" href="https://iss-live.pages.dev/" />` → `…/console/`; the comment above it: say the deep link `?part=` resolves to `/console/`.
- `og:url` → `https://iss-live.pages.dev/console/`; `og:title` and `twitter:title` → `ISS Live — the live console`.
- JSON-LD `"url"` → `https://iss-live.pages.dev/console/`.
- The `<noscript>` list: replace its eight `<li>` by the bar's entries plus the home page: `/` (Home), `/passes/` (When to see the ISS), `/station/` (The station, module by module), `/telemetry/` (Systems), `/about/` (How it works).
- The module script stays `<script type="module" src="/src/main.tsx"></script>`.

- [ ] **Step 4: Create the home shell `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script>
      // Links from when the console was the home page — /?part=cupola — go to the console, before
      // anything is drawn. Cloudflare Pages cannot redirect on a query parameter.
      if (/[?&]part=/.test(location.search)) location.replace('/console/' + location.search + location.hash)
    </script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#090e15" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="/pages.css" />
    <title>ISS Live — where is the International Space Station right now?</title>
    <meta
      name="description"
      content="Where the International Space Station is right now, when you can see it from your city, and how it works — from NASA's public data. Nothing invented."
    />
    <link rel="canonical" href="https://iss-live.pages.dev/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="ISS Live" />
    <meta property="og:url" content="https://iss-live.pages.dev/" />
    <meta property="og:title" content="ISS Live — the International Space Station, right now" />
    <meta property="og:description" content="Where the station is, when you can see it, and how it works — from NASA's public data." />
    <meta property="og:image" content="https://iss-live.pages.dev/social-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="A dark world map with the station's ground track drawn as a green sine curve, titled ISS Live." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="ISS Live — the International Space Station, right now" />
    <meta name="twitter:description" content="Where the station is, when you can see it, and how it works." />
    <meta name="twitter:image" content="https://iss-live.pages.dev/social-card.png" />
    <meta name="twitter:image:alt" content="A dark world map with the station's ground track drawn as a green sine curve, titled ISS Live." />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "ISS Live",
        "url": "https://iss-live.pages.dev/",
        "description": "Where the International Space Station is right now, when you can see it, and how it works, from NASA's public data.",
        "inLanguage": "en",
        "sameAs": ["https://github.com/maximvs101/iss-live"]
      }
    </script>
  </head>
  <body>
    <!--site-header-->
    <main class="page home">
      <p class="eyebrow">Right now</p>
      <h1 class="home__heading">
        <span class="home__title">The International Space Station, right now:</span>
        <span class="home__where" id="home-where">somewhere over the Earth, about 420 km up.</span>
      </h1>

      <div id="home-app" class="home__app">
        <noscript><p class="note">The station’s position is computed in your browser and needs JavaScript. Everything else here reads without it.</p></noscript>
      </div>

      <section class="block" aria-labelledby="what">
        <h2 id="what">What is ISS Live</h2>
        <p>
          ISS Live follows the International Space Station from two public sources: the telemetry NASA broadcasts —
          power, air, cooling, attitude, the onboard computers — and the station’s orbital elements, from which its
          position is computed in your browser. Nothing is invented. When a value is old, its age is stated; when the
          broadcast goes silent, the page says so rather than showing yesterday’s numbers as today’s.
        </p>
      </section>

      <nav class="doors" aria-label="Where to go next">
        <a class="door" href="/console/"><span class="door__name">Live console</span><span class="door__hint">Every public reading, the map and the station in 3D</span></a>
        <a class="door" href="/passes/"><span class="door__name">When to see it</span><span class="door__hint">The passes over your city for the next five days</span></a>
        <a class="door" href="/telemetry/"><span class="door__name">How the station works</span><span class="door__hint">Power, life support, cooling, attitude, communications</span></a>
        <a class="door" href="/about/"><span class="door__name">About this site</span><span class="door__hint">Where the numbers come from, and how they are checked</span></a>
      </nav>
    </main>
    <!--site-footer-->
    <script type="module" src="/src/home/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/home/main.tsx
// The home page's script. Task 8 mounts the application here; until then the page is its HTML.
export {}
```

- [ ] **Step 5: Register the entries and the chrome in `vite.config.ts`**

- `input` becomes: `{ main: fileURLToPath(new URL('./index.html', import.meta.url)), console: fileURLToPath(new URL('./console/index.html', import.meta.url)), passes: fileURLToPath(new URL('./passes/index.html', import.meta.url)) }`.
- `siteChrome().transformIndexHtml`:

```ts
    transformIndexHtml(html, ctx) {
      // The console is an application with its own bar (SiteNav); the two documents here are pages.
      const path = ctx.path === '/index.html' ? '/' : ctx.path.startsWith('/passes/') ? '/passes/' : null
      if (!path) return html
      return html.replace('<!--site-header-->', siteHeader(path)).replace('<!--site-footer-->', siteFooter())
    },
```

- [ ] **Step 6: Write `src/ui/SiteNav.tsx` and put it in the console header**

```tsx
// src/ui/SiteNav.tsx
/**
 * The site's bar, in the console.
 *
 * The same list as every rendered page (src/site/nav.ts); it replaces the title that stood alone at
 * the head of the console, so the pages that explain it are one click away instead of a panel below
 * the fold — "Read about it" sat at the foot of the side column, out of sight on an ordinary screen.
 */
import { NAV, navState } from '../site/nav.ts'

export function SiteNav({ path }: { path: string }) {
  return (
    <nav className="app__nav" aria-label="Site">
      <a className="app__nav-brand" href="/">
        ISS Live
      </a>
      <ul className="app__nav-links">
        {NAV.map((item) => (
          <li key={item.href}>
            <a href={item.href} aria-current={navState(path, item.href)}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

In `src/App.tsx`:
- Remove `import { SiteFooter } from './ui/SiteFooter'` and the `<SiteFooter />` line; `git rm src/ui/SiteFooter.tsx`.
- Add `import { SiteNav } from './ui/SiteNav'`.
- Replace

```tsx
        <div className="app__brand">
          <h1>ISS Live</h1>
        </div>
```

with

```tsx
        {/* The page's title for a screen reader; the bar carries the name on screen. */}
        <h1 className="visually-hidden">ISS Live — the live console</h1>
        <SiteNav path="/console/" />
```

In `src/App.css`:
- Replace the `.app__brand h1 { … }` rule by:

```css
/* The site's bar, where the title stood alone: the brand, then the five pages. */
.app__nav {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 18px;
  min-width: 0;
}

.app__nav-brand {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--text-strong);
}

.app__nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
}

.app__nav-links a {
  color: var(--text-dim);
  text-decoration: none;
  padding: 4px 0;
}

.app__nav-links a:hover,
.app__nav-links a[aria-current] {
  color: var(--text-strong);
  border-bottom: 1px solid var(--text-dim);
}
```

- In the `@media (max-width: 700px)` block, rename `.app__brand` to `.app__nav`.
- Delete the `.app__footer*` rules (`.app__footer`, `.app__footer-title`, `.app__footer-links`, `.app__footer-links a`, `.app__footer-links a:hover`).

- [ ] **Step 7: Links, cache and build checks**

- `passes/index.html`: `<a href="/">the live console</a>` → `<a href="/console/">the live console</a>`.
- `public/_headers`: after the `/index.html` block add

```
/console/
  Cache-Control: public, max-age=0, must-revalidate

# Drawn once at build from Natural Earth; changes only when the script is rerun.
/home-map.svg
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400
```

- `scripts/build-pages.mjs`, after the `/passes/` checks:

```js
  // The console and the home page are built by Vite too, and get the same checks.
  checkPage({ path: '/console/', html: await readFile(resolve(dist, 'console/index.html'), 'utf8') })
  const homeHtml = await readFile(resolve(dist, 'index.html'), 'utf8')
  checkPage({ path: '/', html: homeHtml })
  if (homeHtml.includes('<!--site-')) throw new Error('/: the site header or footer was not injected')

  // No page may still send a part to the home page: /?part= is only there for old links.
  for (const page of [...pages, { path: '/', html: homeHtml }]) {
    if (page.html.includes('href="/?part=')) throw new Error(`${page.path}: links a part to /?part= instead of /console/?part=`)
  }
```

and change the sitemap line to `const paths = ['/', '/console/', '/passes/', ...pages.map((p) => p.path)]`.

- [ ] **Step 8: Run tests, build, and measure the console header**

Run: `npx vitest run src/home/redirect.test.ts src/ui/SiteNav.test.tsx` → PASS. Then `npx tsc -b && npm run lint && npm test && npm run build` → green; the build prints `/console/`, `/`, `/telemetry/` lines and `sitemap.xml  12 URLs`.

Then start the `iss-live-dist` preview and measure the console header height at 1366×768, 1920×1080 and 375×812 (`document.querySelector('.app__header').getBoundingClientRect().height`, after a screenshot so layout has settled). Compare with `git stash`-free baseline by checking out `HEAD~1` into a temporary worktree and measuring the same. Expected: at 1366 and 1920 the header stays one row (height within 4 px of before). **If it wraps to two rows at 1366**, move `<SiteNav />` out of `.app__header` into its own row just above it (`<div className="app__navbar"><SiteNav …/></div>` with `border-bottom: 1px solid var(--border); padding: 6px 16px; background: var(--bg-panel)`), ledger the ruling, and remeasure the map and readings at 1366×768 and 1292×677 against their earlier values (map width 517/356 px rows as recorded in `src/App.css` comments).

- [ ] **Step 9: Commit**

```bash
git add -A index.html console src/home src/ui src/App.tsx src/App.css vite.config.ts public/_headers passes/index.html scripts/build-pages.mjs
git commit -F - <<'EOF'
La console passe a /console/, l'accueil prend /, la barre du site entre dans la console

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Les blocs repliables de la console, mémorisés

**Files:**
- Create: `src/ui/useFold.ts`, `src/ui/useFold.test.tsx`
- Modify: `src/ui/FreshnessPanel.tsx` (its `<details>` gets `open`/`onToggle`), `src/ui/charts/OrbitProfile.tsx` (`<section>` → `<details>` with a summary)

**Interfaces:**
- Produces: `useFold(key: string, storage?: Storage | null): { open: boolean; onToggle: (event: React.SyntheticEvent<HTMLDetailsElement>) => void }` ; storage key `iss-live.fold.<key>`, values `'1'`/`'0'`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/useFold.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useFold } from './useFold'

afterEach(cleanup)

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

function Panel({ storage }: { storage: Storage | null }) {
  const fold = useFold('freshness', storage)
  return (
    <details open={fold.open} onToggle={fold.onToggle}>
      <summary>Data freshness</summary>
      <p>grid</p>
    </details>
  )
}

describe('useFold', () => {
  it('starts closed, and remembers being opened', () => {
    const storage = memoryStorage()
    const { container } = render(<Panel storage={storage} />)
    const details = container.querySelector('details')!
    expect(details.open).toBe(false)
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(storage.getItem('iss-live.fold.freshness')).toBe('1')
  })

  it('opens as it was left', () => {
    const { container } = render(<Panel storage={memoryStorage({ 'iss-live.fold.freshness': '1' })} />)
    expect(container.querySelector('details')!.open).toBe(true)
  })

  // Review focus 5
  it('works with storage blocked', () => {
    const blocked = new Proxy({} as Storage, {
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    const { container } = render(<Panel storage={blocked} />)
    const details = container.querySelector('details')!
    expect(details.open).toBe(false)
    details.open = true
    expect(() => fireEvent(details, new Event('toggle'))).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/useFold.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/ui/useFold.ts`**

```ts
/**
 * Whether a folding panel is open, remembered in this browser.
 *
 * The side column had four panels stacked and the pages that explain them below the fold. Two of
 * the four fold now, closed by default with the one thing worth knowing in their summary line, and
 * a reader who opens one finds it open next time. Storage may be blocked (a private window): the
 * panel then simply starts closed.
 */
import { useState, type SyntheticEvent } from 'react'

const PREFIX = 'iss-live.fold.'

function defaultStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function useFold(key: string, storage: Storage | null = defaultStorage()) {
  const [open, setOpen] = useState(() => {
    try {
      return storage?.getItem(PREFIX + key) === '1'
    } catch {
      return false
    }
  })
  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open
    setOpen(next)
    try {
      storage?.setItem(PREFIX + key, next ? '1' : '0')
    } catch {
      // Blocked or full: it opens closed next time, which is the default anyway.
    }
  }
  return { open, onToggle }
}
```

- [ ] **Step 4: Apply it**

`src/ui/FreshnessPanel.tsx`: add `import { useFold } from './useFold'`; inside the component `const fold = useFold('freshness')`; change `<details className="panel panel--folding">` to `<details className="panel panel--folding" open={fold.open} onToggle={fold.onToggle}>`.

`src/ui/charts/OrbitProfile.tsx`: add `import { useFold } from '../useFold'`; inside the component `const fold = useFold('next-orbit')`; replace the opening

```tsx
    <section className="panel">
      <h2 className="panel__title">Next orbit</h2>
```

by

```tsx
    <details className="panel panel--folding" open={fold.open} onToggle={fold.onToggle}>
      {/* Folded by default like the freshness panel: the summary line carries what the two
          charts show at a glance, and the column gives the map and the inspector the room. */}
      <summary className="panel__toggle">
        <h2 className="panel__title">Next orbit</h2>
        <span className="panel__designation">
          {profile ? `${profile.eclipseMinutes.toFixed(0)} min in Earth’s shadow` : 'computing…'}
        </span>
      </summary>
```

and the closing `</section>` by `</details>`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ui` → PASS (the new file and the existing UI tests). `npx tsc -b` → no error.

- [ ] **Step 6: Commit**

```bash
git add src/ui/useFold.ts src/ui/useFold.test.tsx src/ui/FreshnessPanel.tsx src/ui/charts/OrbitProfile.tsx
git commit -F - <<'EOF'
Console : fraicheur et prochaine orbite se replient, et s'en souviennent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Le lieu survolé en une phrase, partagé par la console et l'accueil

**Files:**
- Modify: `src/orbit/overflight.ts` (add `overflightLabel`), `src/ui/NowOver.tsx` (use it)
- Create: `src/home/position.ts`, `src/home/position.test.ts`
- Test: add to `src/orbit/overflight.test.ts`

**Interfaces:**
- Produces: `overflightLabel(o: Overflight): string` (`'France'`, `'the South Atlantic Ocean'`, `'open water'`) ; `positionLine(state: { latitude: number; longitude: number; altitude: number }, placeLabel: string | null): string` ; `motionLine(state: { speed: number; shadow: number }): string`.

- [ ] **Step 1: Write the failing tests**

Add to `src/orbit/overflight.test.ts`:

```ts
import { overflightLabel } from './overflight'

describe('overflightLabel', () => {
  it('names a country bare, a sea with its article, and open water as such', () => {
    expect(overflightLabel({ name: 'France', kind: 'country' })).toBe('France')
    expect(overflightLabel({ name: 'South Atlantic Ocean', kind: 'marine' })).toBe('the South Atlantic Ocean')
    expect(overflightLabel({ name: 'open water', kind: 'water' })).toBe('open water')
  })
})
```

```ts
// src/home/position.test.ts
import { describe, expect, it } from 'vitest'
import { motionLine, positionLine } from './position.ts'

const state = { latitude: -12.34, longitude: -25.11, altitude: 418.4, speed: 7.66, shadow: 0 }

describe('positionLine', () => {
  it('says where the station is in coordinates until the place has a name', () => {
    expect(positionLine(state, null)).toBe('Over 12.3° S, 25.1° W, 418 km up.')
  })

  it('names the place once it can', () => {
    expect(positionLine(state, 'the South Atlantic Ocean')).toBe('Over the South Atlantic Ocean, 418 km up.')
    expect(positionLine(state, 'France')).toBe('Over France, 418 km up.')
  })
})

describe('motionLine', () => {
  it('gives the speed and whether the station is lit', () => {
    expect(motionLine(state)).toBe('27,576 km/h · in sunlight')
    expect(motionLine({ ...state, shadow: 1 })).toBe('27,576 km/h · in the Earth’s shadow')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/orbit/overflight.test.ts src/home/position.test.ts`
Expected: FAIL — `overflightLabel` not exported; `./position.ts` not found.

- [ ] **Step 3: Implement**

In `src/orbit/overflight.ts`, after `overflightAt`:

```ts
/**
 * The overflown place as a phrase that reads after "over": a country bare, a sea with its article,
 * and a gap in the marine set as "open water". Shared by the console's strip and the home page.
 */
export function overflightLabel(overflight: Overflight): string {
  if (overflight.kind === 'country') return overflight.name
  if (overflight.kind === 'water') return 'open water'
  return `the ${overflight.name}`
}
```

In `src/ui/NowOver.tsx`: import `overflightLabel` with `overflightAt`; replace the `label` ternary by `const label = overflight ? overflightLabel(overflight) : '—'`.

```ts
// src/home/position.ts
/**
 * The home page's two lines about where the station is.
 *
 * Coordinates first, because they are computed at once; the name of the place replaces them when
 * the outlines that give it have loaded — and if they never load, the coordinates stay, which is
 * the same fact said less kindly.
 */
import { formatLatitude, formatLongitude } from '../orbit/coordinates.ts'

export function positionLine(
  state: { latitude: number; longitude: number; altitude: number },
  placeLabel: string | null,
): string {
  const where = placeLabel ?? `${formatLatitude(state.latitude, 1)}, ${formatLongitude(state.longitude, 1)}`
  return `Over ${where}, ${Math.round(state.altitude)} km up.`
}

const kmh = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

export function motionLine(state: { speed: number; shadow: number }): string {
  return `${kmh.format(state.speed * 3600)} km/h · ${state.shadow < 0.5 ? 'in sunlight' : 'in the Earth’s shadow'}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/orbit src/home/position.test.ts src/ui` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/orbit/overflight.ts src/orbit/overflight.test.ts src/ui/NowOver.tsx src/home/position.ts src/home/position.test.ts
git commit -F - <<'EOF'
Le lieu survole en une phrase, partage par la console et l'accueil

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Le prochain passage, depuis la ville mémorisée

**Files:**
- Create: `src/home/nextPass.ts`, `src/home/nextPass.test.ts`
- Modify: `src/passes/findPasses.ts` (export `MAX_ELEMENTS_AGE_HOURS`), `src/passes/PassesApp.tsx` (import it instead of its own constant)

**Interfaces:**
- Consumes: `readStored`, `resolveChoice`, `placeLabel`, `placeTimeZone`, `Place` (`src/passes/place.ts`) ; `findPasses`, `positionFrom`, `Pass` ; `formatDay`, `formatTime` ; `brightnessOf` ; `elementsAgeHours`, `OrbitalElements` (`src/orbit/tle.ts`) ; `Fetcher` (`src/passes/cities.ts`).
- Produces: `type NextPass = { kind: 'pass'; place: Place; pass: Pass } | { kind: 'none'; place: Place } | { kind: 'ask' } | { kind: 'stale' }` ; `nextVisible(storage: Storage | null, elements: OrbitalElements, now: number, fetcher?: Fetcher): Promise<NextPass>` ; `nextPassLine(next: NextPass, now: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/home/nextPass.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { twoline2satrec } from 'satellite.js'
import { nextPassLine, nextVisible } from './nextPass.ts'
import { clearCityCache, type Fetcher } from '../passes/cities.ts'
import { STORAGE_KEY } from '../passes/place.ts'
import type { OrbitalElements } from '../orbit/tle.ts'

afterEach(() => clearCityCache())

const elements: OrbitalElements = {
  satrec: twoline2satrec(
    '1 25544U 98067A   26209.15252568  .00016717  00000+0  30074-3 0  9993',
    '2 25544  51.6393 210.5107 0002140 106.5723 253.5556 15.50022337 12345',
  ),
  epoch: new Date('2026-07-28T03:39:38Z'),
  source: 'reseau',
  objectName: 'ISS (ZARYA)',
}
const NOW = Date.parse('2026-07-28T00:00:00Z')
const fetcher: Fetcher = async (url) =>
  url === '/cities/p.json'
    ? { ok: true, json: async () => ({ tz: ['Europe/Paris'], rows: [['paris-fr', 'Paris', 'paris', 'FR', 48.85, 2.35, 0, 2138551]] }) }
    : { ok: false, json: async () => null }
const stored = (value: string | null): Storage =>
  ({ getItem: (k: string) => (k === STORAGE_KEY ? value : null) }) as Storage

describe('nextVisible', () => {
  it('finds the next visible pass for the remembered city', async () => {
    const next = await nextVisible(stored(JSON.stringify({ kind: 'city', slug: 'paris-fr' })), elements, NOW, fetcher)
    expect(next.kind).toBe('pass')
    if (next.kind !== 'pass') return
    expect(next.pass.visible!.end.date.getTime()).toBeGreaterThan(NOW)
    expect(nextPassLine(next, NOW)).toMatch(/^Next visible from Paris: (today|tomorrow|\w{3} \d+) at \d\d:\d\d · (very bright|bright|visible but faint)$/)
  })

  // Review focus 4
  it('asks for a city when none is remembered, or the one remembered is unreadable or unknown', async () => {
    expect((await nextVisible(stored(null), elements, NOW, fetcher)).kind).toBe('ask')
    expect((await nextVisible(stored('{broken'), elements, NOW, fetcher)).kind).toBe('ask')
    expect((await nextVisible(stored(JSON.stringify({ kind: 'city', slug: 'atlantis-xx' })), elements, NOW, fetcher)).kind).toBe('ask')
    expect((await nextVisible(null, elements, NOW, fetcher)).kind).toBe('ask')
    expect(nextPassLine({ kind: 'ask' }, NOW)).toBe('When can you see it from your city?')
  })

  it('works for a remembered position, named as such', async () => {
    const here = JSON.stringify({ kind: 'here', latitude: 48.9, longitude: 2.4, timeZone: 'Europe/Paris' })
    const next = await nextVisible(stored(here), elements, NOW, fetcher)
    expect(next.kind).toBe('pass')
    expect(nextPassLine(next, NOW)).toMatch(/^Next visible from your location: /)
  })

  it('gives no time from elements too old to give one', async () => {
    const next = await nextVisible(stored(JSON.stringify({ kind: 'city', slug: 'paris-fr' })), elements, Date.parse('2026-09-23T00:00:00Z'), fetcher)
    expect(next.kind).toBe('stale')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/home/nextPass.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Move the age limit and write the module**

In `src/passes/findPasses.ts`, after `MIN_VISIBLE_SECONDS`:

```ts
/** Past this age, orbital elements give no pass times at all: see PassesApp and the home page. */
export const MAX_ELEMENTS_AGE_HOURS = 14 * 24
```

In `src/passes/PassesApp.tsx`: delete its own `const MAX_ELEMENTS_AGE_HOURS = 14 * 24` (keep the comment above it, now pointing at the constant) and import `MAX_ELEMENTS_AGE_HOURS` from `./findPasses.ts`.

```ts
// src/home/nextPass.ts
/**
 * The next pass worth going outside for, on the home page — for the place the visitor already
 * chose on /passes/, read from the same memory and held to the same rules. The home page never asks
 * for a position itself: that stays on /passes/, where the page explains what happens to it.
 */
import { elementsAgeHours, type OrbitalElements } from '../orbit/tle.ts'
import { brightnessOf } from '../passes/brightness.ts'
import type { Fetcher } from '../passes/cities.ts'
import { MAX_ELEMENTS_AGE_HOURS, findPasses, positionFrom, type Pass } from '../passes/findPasses.ts'
import { placeLabel, placeTimeZone, readStored, resolveChoice, type Place } from '../passes/place.ts'
import { formatDay, formatTime } from '../passes/time.ts'

export type NextPass =
  | { kind: 'pass'; place: Place; pass: Pass }
  | { kind: 'none'; place: Place }
  | { kind: 'ask' }
  | { kind: 'stale' }

export async function nextVisible(
  storage: Storage | null,
  elements: OrbitalElements,
  now: number,
  fetcher?: Fetcher,
): Promise<NextPass> {
  const stored = readStored(storage)
  if (!stored) return { kind: 'ask' }
  const place = await resolveChoice({ source: 'stored', stored }, fetcher).catch(() => null)
  if (!place) return { kind: 'ask' }
  if (elementsAgeHours(elements, now) > MAX_ELEMENTS_AGE_HOURS) return { kind: 'stale' }
  const observer = place.kind === 'city' ? place.city : place
  const pass = findPasses(positionFrom(elements.satrec), observer, new Date(now), 5).find(
    (p) => p.visible && p.visible.end.date.getTime() >= now,
  )
  return pass ? { kind: 'pass', place, pass } : { kind: 'none', place }
}

const where = (place: Place) => (place.kind === 'city' ? place.city.name : 'your location')

export function nextPassLine(next: NextPass, now: number): string {
  if (next.kind === 'ask') return 'When can you see it from your city?'
  if (next.kind === 'stale') return 'Pass times need fresher orbital elements than this page could fetch.'
  if (next.kind === 'none') return `No visible pass over ${placeLabel(next.place)} in the next five days.`
  const v = next.pass.visible!
  const zone = placeTimeZone(next.place)
  const day = formatDay(v.start.date, zone, new Date(now))
  const when = day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day
  return `Next visible from ${where(next.place)}: ${when} at ${formatTime(v.start.date, zone)} · ${brightnessOf(v.magnitude)}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/home/nextPass.test.ts src/passes` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/home/nextPass.ts src/home/nextPass.test.ts src/passes/findPasses.ts src/passes/PassesApp.tsx
git commit -F - <<'EOF'
Accueil : le prochain passage visible, depuis la ville memorisee par /passes/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: L'état de la diffusion NASA — le Worker et sa lecture

**Files:**
- Create: `worker/src/status.js`, `worker/src/status.test.js`, `src/home/status.ts`, `src/home/status.test.ts`
- Modify: `worker/src/index.js` (route `/status`), `worker/schema.sql` (partial index)

**Interfaces:**
- Produces (Worker): `status(env, now?: number): Promise<{ live: boolean; lastLive: string | null; checkedAt: string | null }>` ; `STATUS_HEADERS`.
- Produces (site): `interface BroadcastStatus { live: boolean; lastLive: string | null }` ; `STATUS_URL: string | null` ; `fetchStatus(url?: string | null, fetcher?: typeof fetch, timeoutMs?: number): Promise<BroadcastStatus | null>` ; `statusLine(status: BroadcastStatus): string`.

- [ ] **Step 1: Write the failing tests**

```js
// worker/src/status.test.js
import { describe, expect, it } from 'vitest'
import { STATUS_HEADERS, status } from './status.js'

/** A D1 stand-in that answers each query by its text. */
function db(rows) {
  return {
    prepare: (sql) => ({ first: async () => (sql.includes('pushes > 0') ? rows.live : rows.last) }),
  }
}
const NOW = Date.parse('2026-09-23T12:00:00Z')

describe('status', () => {
  it('is live when the station spoke in the last ten minutes', async () => {
    const env = { DB: db({ live: { at: '2026-09-23T11:55:12Z' }, last: { at: '2026-09-23T11:59:12Z' } }) }
    expect(await status(env, NOW)).toEqual({ live: true, lastLive: '2026-09-23T11:55:12Z', checkedAt: '2026-09-23T11:59:12Z' })
  })

  it('is silent, with the date it last spoke, otherwise', async () => {
    const env = { DB: db({ live: { at: '2026-09-14T14:14:20Z' }, last: { at: '2026-09-23T11:59:12Z' } }) }
    expect(await status(env, NOW)).toEqual({ live: false, lastLive: '2026-09-14T14:14:20Z', checkedAt: '2026-09-23T11:59:12Z' })
  })

  it('says so when it never spoke', async () => {
    const env = { DB: db({ live: null, last: null }) }
    expect(await status(env, NOW)).toEqual({ live: false, lastLive: null, checkedAt: null })
  })

  it('may be read by the site, and cached for a minute', () => {
    expect(STATUS_HEADERS['access-control-allow-origin']).toBe('https://iss-live.pages.dev')
    expect(STATUS_HEADERS['cache-control']).toBe('public, max-age=60')
  })
})
```

```ts
// src/home/status.test.ts
import { describe, expect, it } from 'vitest'
import { fetchStatus, statusLine } from './status.ts'

const answer = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch

describe('fetchStatus', () => {
  it('reads the collector’s answer', async () => {
    expect(await fetchStatus('https://x/status', answer({ live: false, lastLive: '2026-09-14T14:14:20Z', checkedAt: 'x' }))).toEqual({
      live: false,
      lastLive: '2026-09-14T14:14:20Z',
    })
  })

  // Review focus 2
  it('gives up on a slow or malformed answer, or none at all', async () => {
    expect(await fetchStatus(null, answer({ live: true, lastLive: null }))).toBeNull()
    expect(await fetchStatus('https://x/status', answer({ live: 'yes' }))).toBeNull()
    expect(await fetchStatus('https://x/status', answer({}, false))).toBeNull()
    const failing = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await fetchStatus('https://x/status', failing)).toBeNull()
    const never = (() => new Promise(() => {})) as unknown as typeof fetch
    expect(await fetchStatus('https://x/status', never, 20)).toBeNull()
  })
})

describe('statusLine', () => {
  it('says live, or since when it has been silent', () => {
    expect(statusLine({ live: true, lastLive: '2026-09-23T11:55:12Z' })).toBe('live telemetry from the station')
    expect(statusLine({ live: false, lastLive: '2026-09-14T14:14:20Z' })).toBe('NASA’s broadcast silent since 14 Sept')
    expect(statusLine({ live: false, lastLive: null })).toBe('NASA’s broadcast is silent')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run worker/src/status.test.js src/home/status.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: The Worker side**

```js
// worker/src/status.js
/**
 * Is NASA broadcasting? Answered from what the collector already records every minute.
 *
 * For the home page, which cannot afford a Lightstreamer session to find out. Two reads of one row
 * each: the last minute the station pushed anything — through the partial index in schema.sql, so
 * a two-week silence does not mean scanning twenty thousand rows — and the last minute the
 * collector ran at all.
 */
const LIVE_WITHIN_MS = 10 * 60_000

export const STATUS_HEADERS = {
  'access-control-allow-origin': 'https://iss-live.pages.dev',
  'cache-control': 'public, max-age=60',
}

export async function status(env, now = Date.now()) {
  const live = await env.DB.prepare('SELECT at FROM liveness WHERE pushes > 0 ORDER BY at DESC LIMIT 1').first()
  const last = await env.DB.prepare('SELECT at FROM liveness ORDER BY at DESC LIMIT 1').first()
  const lastLive = live?.at ?? null
  return {
    live: lastLive !== null && now - Date.parse(lastLive) <= LIVE_WITHIN_MS,
    lastLive,
    checkedAt: last?.at ?? null,
  }
}
```

In `worker/src/index.js`: add `import { STATUS_HEADERS, status } from './status.js'` at the top, and in `fetch`, before `/report`:

```js
    if (url.pathname === '/status') {
      return Response.json(await status(env), { headers: STATUS_HEADERS })
    }
```

Append to `worker/schema.sql`:

```sql
-- The last minute the station pushed anything, read by /status for the home page. Partial, so the
-- read is one row however long the broadcast has been silent.
CREATE INDEX IF NOT EXISTS liveness_live ON liveness(at) WHERE pushes > 0;
```

- [ ] **Step 4: The site side**

```ts
// src/home/status.ts
/**
 * Whether NASA is broadcasting, for one line on the home page.
 *
 * Read from the collector's /status rather than by opening a Lightstreamer session, which is the
 * weight of the whole console. Any failure — no address yet, no answer in four seconds, an answer
 * of the wrong shape — gives null, and the page leaves the line out rather than guessing.
 */
export interface BroadcastStatus {
  live: boolean
  lastLive: string | null
}

/** The collector's public address; set when the Worker with /status is deployed (see the plan's Task 9). */
export const STATUS_URL: string | null = null

export async function fetchStatus(
  url: string | null = STATUS_URL,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<BroadcastStatus | null> {
  if (!url) return null
  try {
    const answer = fetcher(url).then(async (response) => (response.ok ? response.json() : null))
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    const body = (await Promise.race([answer, timeout])) as Record<string, unknown> | null
    if (!body || typeof body.live !== 'boolean') return null
    const lastLive = typeof body.lastLive === 'string' ? body.lastLive : null
    return { live: body.live, lastLive }
  } catch {
    return null
  }
}

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function statusLine(status: BroadcastStatus): string {
  if (status.live) return 'live telemetry from the station'
  if (!status.lastLive) return 'NASA’s broadcast is silent'
  return `NASA’s broadcast silent since ${day.format(new Date(status.lastLive))}`
}
```

Note: `en-GB` short month for September is `Sept` in current ICU; the test pins what the runtime gives. If the runtime prints `Sep`, change the test's expectation, not the code, and ledger it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run worker/src/status.test.js src/home/status.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/src/status.js worker/src/status.test.js worker/src/index.js worker/schema.sql src/home/status.ts src/home/status.test.ts
git commit -F - <<'EOF'
Collecteur : un point d'acces /status, et sa lecture pour l'accueil

Pas encore deploye : le Worker et l'index D1 attendent l'accord explicite.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: La carte de l'accueil

**Files:**
- Create: `scripts/lib/world-paths.mjs`, `scripts/lib/world-paths.test.mjs`, `scripts/build-home-map.mjs`, `public/home-map.svg` (generated, committed), `src/home/HomeMap.tsx`, `src/home/HomeMap.test.tsx`
- Modify: `package.json` (`build:home-map`)

**Interfaces:**
- Produces: `landPath(rings: number[][][], width: number, height: number): string` (SVG path, pen lifted at the antimeridian) ; `/home-map.svg` with `viewBox="0 0 360 180"` ; `HomeMap({ track, position, label }: { track: { latitude: number; longitude: number; date: Date }[]; position: { latitude: number; longitude: number } | null; label: string; now: number })`.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/lib/world-paths.test.mjs
import { describe, expect, it } from 'vitest'
import { landPath } from './world-paths.mjs'

describe('landPath', () => {
  it('projects equirectangularly, as the console map does', () => {
    expect(landPath([[[-180, 90], [0, 0], [180, -90]]], 360, 180)).toBe('M0 0L180 90L360 180Z')
  })

  it('lifts the pen where a ring crosses the antimeridian', () => {
    const d = landPath([[[170, 0], [-170, 0], [-170, 10], [170, 10]]], 360, 180)
    expect(d).toBe('M350 90M10 90L10 80M350 80Z')
  })
})
```

```tsx
// src/home/HomeMap.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HomeMap } from './HomeMap.tsx'

afterEach(cleanup)
const NOW = Date.parse('2026-09-23T12:00:00Z')
const at = (minutes: number, longitude: number, latitude: number) => ({ date: new Date(NOW + minutes * 60_000), longitude, latitude })

describe('HomeMap', () => {
  it('draws the track behind and ahead, split at the antimeridian, and the station', () => {
    const { container } = render(
      <HomeMap
        track={[at(-10, 170, 0), at(-5, 178, 5), at(0, -178, 10), at(5, -170, 15)]}
        position={{ latitude: 10, longitude: -178 }}
        label="Over the Pacific Ocean, 418 km up."
        now={NOW}
      />,
    )
    expect(screen.getByRole('img', { name: 'Over the Pacific Ocean, 418 km up.' })).toBeTruthy()
    expect(container.querySelectorAll('.home-map__past').length).toBe(1)
    expect(container.querySelectorAll('.home-map__ahead').length).toBe(1)
    const dot = container.querySelector('.home-map__station')!
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(2, 5)
    expect(Number(dot.getAttribute('cy'))).toBeCloseTo(80, 5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/lib/world-paths.test.mjs src/home/HomeMap.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the path and the build script**

```js
// scripts/lib/world-paths.mjs
/**
 * Land outlines as one SVG path, in the console map's projection (equirectangular: x from longitude,
 * y down from the north). The pen is lifted wherever a ring jumps across the antimeridian — a straight
 * line between 179° E and 179° W is a streak across the whole map. Same rule as the social card.
 */
export function landPath(rings, width, height) {
  const x = (lon) => ((lon + 180) / 360) * width
  const y = (lat) => ((90 - lat) / 180) * height
  const fmt = (n) => String(Math.round(n * 10) / 10)
  return rings
    .map((ring) => {
      let d = ''
      for (let i = 0; i < ring.length; i += 1) {
        const [lon, lat] = ring[i]
        const jump = i > 0 && Math.abs(lon - ring[i - 1][0]) > 180
        d += `${i === 0 || jump ? 'M' : 'L'}${fmt(x(lon))} ${fmt(y(lat))}`
      }
      return `${d}Z`
    })
    .join('')
}
```

```js
// scripts/build-home-map.mjs
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
const rings = features.flatMap((f) => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates))

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180" preserveAspectRatio="none"><rect width="360" height="180" fill="#0a1622"/><path d="${landPath(rings, 360, 180)}" fill="#111e28" stroke="#31536b" stroke-width="0.35" stroke-linejoin="round"/></svg>\n`
writeFileSync(new URL('../public/home-map.svg', import.meta.url), svg)
console.log(`public/home-map.svg  ${(svg.length / 1024).toFixed(1)} kB, ${rings.length} rings`)
```

Add to `package.json` scripts after `build:cities`: `"build:home-map": "node scripts/build-home-map.mjs",`. Run it: `npm run build:home-map` → expected one line, size under 60 kB.

- [ ] **Step 4: Write `src/home/HomeMap.tsx`**

```tsx
/**
 * The home page's map: the static world drawn at build (/home-map.svg), and over it, in the same
 * 360 × 180 frame, the track behind (dim), the track ahead (green) and the station.
 */
import { latToY, lonToX, splitAtAntimeridian } from '../scene/map/projection.ts'

const SIZE = { width: 360, height: 180 }

interface Point {
  latitude: number
  longitude: number
  date: Date
}

function path(points: Point[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${lonToX(p.longitude, SIZE).toFixed(1)} ${latToY(p.latitude, SIZE).toFixed(1)}`)
    .join('')
}

export function HomeMap({
  track,
  position,
  label,
  now,
}: {
  track: Point[]
  position: { latitude: number; longitude: number } | null
  label: string
  now: number
}) {
  const past = splitAtAntimeridian(track.filter((p) => p.date.getTime() <= now))
  const ahead = splitAtAntimeridian(track.filter((p) => p.date.getTime() >= now))
  return (
    <div className="home-map">
      <img className="home-map__world" src="/home-map.svg" alt="" width={720} height={360} />
      <svg className="home-map__overlay" viewBox="0 0 360 180" role="img" aria-label={label} preserveAspectRatio="none">
        {past.map((run, i) => (
          <path key={`p${i}`} className="home-map__past" d={path(run)} />
        ))}
        {ahead.map((run, i) => (
          <path key={`a${i}`} className="home-map__ahead" d={path(run)} />
        ))}
        {position && (
          <circle
            className="home-map__station"
            cx={lonToX(position.longitude, SIZE)}
            cy={latToY(position.latitude, SIZE)}
            r={3.2}
          />
        )}
      </svg>
    </div>
  )
}
```

Note: the test's track crosses the antimeridian between the −5 and 0 minute points; `splitAtAntimeridian` on the "ahead" part (0, 5) yields one run, and on the "past" part (−10, −5, 0) yields `[−10, −5]` (the 0 point jumps) — one run each, as the test expects.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run scripts/lib/world-paths.test.mjs src/home/HomeMap.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/world-paths.mjs scripts/lib/world-paths.test.mjs scripts/build-home-map.mjs public/home-map.svg src/home/HomeMap.tsx src/home/HomeMap.test.tsx package.json
git commit -F - <<'EOF'
Accueil : la carte du monde dessinee une fois au build, la station par-dessus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: L'accueil assemblé

**Files:**
- Create: `src/home/HomeApp.tsx`, `src/home/HomeApp.test.tsx`, `src/home/home.css`
- Modify: `src/home/main.tsx`, `scripts/build-pages.mjs` (graph check for `/`)

**Interfaces:**
- Consumes: Tasks 4–7 (`positionLine`, `motionLine`, `nextVisible`, `nextPassLine`, `fetchStatus`, `statusLine`, `HomeMap`) ; `loadOrbitalElements`, `OrbitalElements` ; `propagateIss`, `groundTrack` ; `safeStorage` (`src/passes/place.ts`).
- Produces: `HomeApp(props: HomeAppProps)` with `interface HomeAppProps { loadElements?: () => Promise<OrbitalElements>; clock?: () => number; storage?: Storage | null; loadPlaceNames?: () => Promise<(latitude: number, longitude: number) => string | null>; loadStatus?: () => Promise<BroadcastStatus | null>; fetcher?: Fetcher }`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/home/HomeApp.test.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { twoline2satrec } from 'satellite.js'
import { HomeApp } from './HomeApp.tsx'
import { clearCityCache } from '../passes/cities.ts'
import type { OrbitalElements } from '../orbit/tle.ts'

const elements: OrbitalElements = {
  satrec: twoline2satrec(
    '1 25544U 98067A   26209.15252568  .00016717  00000+0  30074-3 0  9993',
    '2 25544  51.6393 210.5107 0002140 106.5723 253.5556 15.50022337 12345',
  ),
  epoch: new Date('2026-07-28T03:39:38Z'),
  source: 'reseau',
  objectName: 'ISS (ZARYA)',
}
const clock = () => Date.parse('2026-07-28T00:00:00Z')
const loadElements = async () => elements
const empty = { getItem: () => null } as unknown as Storage

beforeEach(() => {
  document.body.innerHTML = '<span id="home-where">somewhere over the Earth, about 420 km up.</span>'
})
afterEach(() => {
  cleanup()
  clearCityCache()
})

describe('HomeApp', () => {
  it('writes the position into the heading, coordinates first, then the place name', async () => {
    let names: (lat: number, lon: number) => string | null = () => null
    let ready: () => void = () => {}
    const loadPlaceNames = () => new Promise<typeof names>((resolve) => (ready = () => resolve((names = () => 'the Coral Sea'))))
    render(<HomeApp loadElements={loadElements} clock={clock} storage={empty} loadPlaceNames={loadPlaceNames} loadStatus={async () => null} />)
    const where = document.getElementById('home-where')!
    await waitFor(() => expect(where.textContent).toMatch(/^Over \d+\.\d° [NS], \d+\.\d° [EW], \d+ km up\.$/))
    ready()
    await waitFor(() => expect(where.textContent).toMatch(/^Over the Coral Sea, \d+ km up\.$/))
  })

  // Review focus 3
  it('keeps the coordinates when the place names cannot load', async () => {
    render(
      <HomeApp loadElements={loadElements} clock={clock} storage={empty} loadPlaceNames={() => Promise.reject(new Error('offline'))} loadStatus={async () => null} />,
    )
    const where = document.getElementById('home-where')!
    await waitFor(() => expect(where.textContent).toMatch(/^Over \d+\.\d° [NS]/))
  })

  it('draws the map and says whether NASA is broadcasting, or leaves that out', async () => {
    const { container, unmount } = render(
      <HomeApp loadElements={loadElements} clock={clock} storage={empty} loadPlaceNames={async () => () => null} loadStatus={async () => ({ live: false, lastLive: '2026-07-20T10:00:00Z' })} />,
    )
    await screen.findByText(/NASA’s broadcast silent since 20 Jul/)
    expect(container.querySelector('.home-map__station')).not.toBeNull()
    unmount()
    render(<HomeApp loadElements={loadElements} clock={clock} storage={empty} loadPlaceNames={async () => () => null} loadStatus={async () => null} />)
    await screen.findByText(/km\/h/)
    expect(screen.queryByText(/NASA’s broadcast/)).toBeNull()
  })

  it('offers /passes/ when no city is remembered', async () => {
    render(<HomeApp loadElements={loadElements} clock={clock} storage={empty} loadPlaceNames={async () => () => null} loadStatus={async () => null} />)
    const link = await screen.findByRole('link', { name: 'When can you see it from your city?' })
    expect(link.getAttribute('href')).toBe('/passes/')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/home/HomeApp.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/home/HomeApp.tsx`**

```tsx
/**
 * The home page's live part: where the station is, its track, whether NASA is broadcasting, and
 * the next pass for the visitor's city. Everything else on the page is HTML that reads without it.
 *
 * The heading's position line lives outside this root — it is the page's h1, and its fallback text
 * is what a crawler reads — so it is written straight into #home-where rather than rendered here.
 */
import { useEffect, useMemo, useState } from 'react'
import { groundTrack, propagateIss } from '../orbit/propagator.ts'
import { loadOrbitalElements, type OrbitalElements } from '../orbit/tle.ts'
import type { Fetcher } from '../passes/cities.ts'
import { safeStorage } from '../passes/place.ts'
import { HomeMap } from './HomeMap.tsx'
import { nextPassLine, nextVisible, type NextPass } from './nextPass.ts'
import { motionLine, positionLine } from './position.ts'
import { fetchStatus, statusLine, type BroadcastStatus } from './status.ts'

type PlaceNames = (latitude: number, longitude: number) => string | null

/** The overflight module — countries and marine areas — after the first paint, never in the entry. */
async function loadOverflight(): Promise<PlaceNames> {
  const module = await import('../orbit/overflight.ts')
  await module.marineReady
  return (latitude, longitude) => {
    const found = module.overflightAt(latitude, longitude)
    return found ? module.overflightLabel(found) : null
  }
}

// Module-level so the effect that calls it does not rerun on every render: a default written as
// `() => fetchStatus()` in the parameter list is a new function each time, and a new dependency.
const defaultStatus = () => fetchStatus()

export interface HomeAppProps {
  loadElements?: () => Promise<OrbitalElements>
  clock?: () => number
  storage?: Storage | null
  loadPlaceNames?: () => Promise<PlaceNames>
  loadStatus?: () => Promise<BroadcastStatus | null>
  fetcher?: Fetcher
}

export function HomeApp({
  loadElements = loadOrbitalElements,
  clock = Date.now,
  storage = safeStorage(),
  loadPlaceNames = loadOverflight,
  loadStatus = defaultStatus,
  fetcher,
}: HomeAppProps) {
  const [elements, setElements] = useState<OrbitalElements | null>(null)
  const [now, setNow] = useState(clock)
  const [names, setNames] = useState<PlaceNames | null>(null)
  const [broadcast, setBroadcast] = useState<BroadcastStatus | null>(null)
  const [next, setNext] = useState<NextPass | null>(null)

  useEffect(() => {
    let live = true
    loadElements().then((loaded) => {
      if (live) setElements(loaded)
    })
    loadPlaceNames().then(
      (lookup) => live && setNames(() => lookup),
      () => {
        // No names: the coordinates stay, which is the same fact said less kindly.
      },
    )
    loadStatus().then((status) => live && setBroadcast(status))
    const timer = setInterval(() => setNow(clock()), 5_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [loadElements, loadPlaceNames, loadStatus, clock])

  useEffect(() => {
    if (!elements) return
    let live = true
    nextVisible(storage, elements, clock(), fetcher).then((found) => live && setNext(found))
    return () => {
      live = false
    }
  }, [elements, storage, fetcher, clock])

  const state = elements ? propagateIss(elements.satrec, new Date(now)) : null
  const minute = Math.floor(now / 60_000)
  const track = useMemo(
    () => (elements ? groundTrack(elements.satrec, new Date(minute * 60_000), -45, 90, 60) : []),
    [elements, minute],
  )
  const place = state && names ? names(Math.round(state.latitude * 10) / 10, Math.round(state.longitude * 10) / 10) : null
  const line = state ? positionLine(state, place) : null

  useEffect(() => {
    const heading = document.getElementById('home-where')
    if (heading && line) heading.textContent = line
  }, [line])

  return (
    <>
      <p className="home__motion">
        {state ? motionLine(state) : ' '}
        {broadcast && <span className={broadcast.live ? 'home__nasa home__nasa--live' : 'home__nasa'}> · {statusLine(broadcast)}</span>}
      </p>
      <HomeMap track={track} position={state} label={line ?? 'The station’s position is being computed.'} now={now} />
      <p className="home__next">{next && <a href="/passes/">{nextPassLine(next, now)}</a>}</p>
    </>
  )
}
```

- [ ] **Step 4: Mount it, style it**

```tsx
// src/home/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HomeApp } from './HomeApp.tsx'
import './home.css'

const root = document.getElementById('home-app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HomeApp />
    </StrictMode>,
  )
}
```

```css
/* src/home/home.css — the home page, on top of /pages.css and its tokens. */
.home__heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.home__title {
  font-size: 13px;
  font-weight: normal;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* Two lines reserved, so the position replacing its fallback moves nothing below it. */
.home__where {
  font-size: clamp(22px, 5vw, 34px);
  line-height: 1.2;
  color: var(--text-strong);
  min-height: 2.4em;
}

/* The line above the map and the next-pass line keep their height from the first paint. */
.home__motion,
.home__next {
  min-height: 1.6em;
  margin: 8px 0;
  color: var(--text-dim);
}

.home__nasa {
  color: #ffb03a;
}

.home__nasa--live {
  color: var(--live);
}

.home-map {
  position: relative;
  aspect-ratio: 2 / 1;
  border: 1px solid var(--border);
  margin: 8px 0 12px;
}

.home-map__world,
.home-map__overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.home-map__past {
  fill: none;
  stroke: var(--idle);
  stroke-width: 0.8;
}

.home-map__ahead {
  fill: none;
  stroke: var(--live);
  stroke-width: 1.1;
}

.home-map__station {
  fill: var(--live);
  stroke: var(--bg);
  stroke-width: 1.2;
}

.doors {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin: 24px 0;
}

.door {
  display: block;
  padding: 12px 14px;
  border: 1px solid var(--border-strong);
  background: var(--bg-panel);
  text-decoration: none;
}

.door:hover,
.door:focus-visible {
  border-color: var(--text-dim);
}

.door__name {
  display: block;
  color: var(--text-strong);
}

.door__hint {
  display: block;
  color: var(--text-dim);
  font-size: 0.85em;
}
```

- [ ] **Step 5: Prove the home page stays light, in `scripts/build-pages.mjs`**

Refactor the existing manifest walk into a function and add the home check after the `/passes/` one:

```js
  // Which chunks an entry reaches: statically (in the first load) or at all (with dynamic imports).
  const reach = (entry, withDynamic) => {
    const seen = new Set()
    const walk = (key) => {
      if (seen.has(key) || !manifest[key]) return
      seen.add(key)
      for (const next of [...(manifest[key].imports ?? []), ...(withDynamic ? (manifest[key].dynamicImports ?? []) : [])]) walk(next)
    }
    walk(entry)
    return [...seen]
  }
  const named = (keys, pattern) => keys.filter((key) => pattern.test(`${key} ${manifest[key].file}`))

  // The home page's first load carries no atlas, three or Lightstreamer; its one dynamic import is
  // the place names (countries and marine areas), after the first paint — and never three or
  // Lightstreamer, at any depth.
  const homeStatic = named(reach('index.html', false), /three|lightstreamer|world-atlas|topojson|marine|StationView|draco/i)
  if (homeStatic.length) throw new Error(`/ loads ${homeStatic.join(', ')} up front`)
  const homeAny = named(reach('index.html', true), /three|lightstreamer|StationView|draco/i)
  if (homeAny.length) throw new Error(`/ can reach ${homeAny.join(', ')}`)
  console.log(`${'/'.padEnd(36)} ${reach('index.html', false).length} chunks up front, none heavy`)
```

(The `/passes/` check becomes `named(reach('passes/index.html', true), /three|lightstreamer|world-atlas|topojson|marine|StationView|draco/i)` with the same error text as before. The manifest is still read once, and `dist/.vite` still removed afterwards.)

- [ ] **Step 6: Run the tests and the build, and prove the check bites**

Run: `npx vitest run src/home` → PASS. Then `npx tsc -b && npm run lint && npm test && npm run build` → green, with `/  N chunks up front, none heavy`.

Then temporarily change `loadOverflight` to a static `import { overflightAt, overflightLabel, marineReady } from '../orbit/overflight.ts'` at the top of `HomeApp.tsx` (using them in the function body), run `npm run build`: expected failure `/ loads … up front`. Restore, rebuild green. Put both outputs in the commit message.

- [ ] **Step 7: Commit**

```bash
git add src/home/HomeApp.tsx src/home/HomeApp.test.tsx src/home/home.css src/home/main.tsx scripts/build-pages.mjs
git commit -F - <<'EOF'
L'accueil : ou est la station, sa trace, le prochain passage et l'etat de la diffusion

<coller la ligne "/ … chunks up front, none heavy", et l'echec provoque par l'import statique>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Mesurer, documenter, préparer les déploiements

**Files:**
- Create: `docs/home-verification.md`
- Modify: `docs/architecture.md`, and later `src/home/status.ts` (`STATUS_URL`, once the Worker is deployed with the user's approval)

- [ ] **Step 1: Look at it**

Start the `iss-live-dist` preview. On `/`: the heading goes from the fallback to coordinates to a place name; the map shows the station and its track; the motion line; the next-pass link goes to `/passes/`; the four doors. On `/console/`: the bar with Console current; Fraîcheur and Prochaine orbite closed, their summaries readable; open one, reload, still open. `/?part=cupola` lands on `/console/?part=cupola` with the cupola selected. `/telemetry/` lists six systems; a subsystem page marks Systems. Screenshot `/` at 375×812 and 1366×768 for the user.

- [ ] **Step 2: Lighthouse and weights**

`CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" npx lighthouse <url> --form-factor=mobile --output=json --output-path=.cache/lh-<name>.json --chrome-flags="--headless=new --no-sandbox"` for `http://localhost:4173/`, `/console/`, `/telemetry/`; read with `.cache/lire-lh.py` (recreate it from the passes plan if missing). Expected: accessibility 100 on all three; home performance ≥ 95; console performance not below its previous value (97 mobile before this work — check `docs/verification.md` or measure `HEAD` of `main` in a worktree first). Record the home's transferred bytes up front and the size of the overflight chunk it loads afterwards.

- [ ] **Step 3: The console's dimensions**

At 1366×768, 1600×900, 1920×1080 and 1292×677, measure the map's width and height and the number of reading rows visible (the method recorded in `src/App.css` comments), with the two panels closed and then open. Expected: map and reading rows identical to the values in those comments. Any difference: find it before going on.

- [ ] **Step 4: Documentation**

`docs/home-verification.md`: what each check covers and its result (tests, build checks with the bite proof, Lighthouse table, weights, console dimensions table). `docs/architecture.md`: a section « The home page and the site's bar »: the three entries, the single nav list, `/telemetry/`, the redirect of old part links, the static map, the deferred place names, `/status` and its partial index, the folding panels.

- [ ] **Step 5: Commit**

```bash
git add docs/home-verification.md docs/architecture.md
git commit -F - <<'EOF'
Accueil et navigation : ce qui a ete mesure, et comment le refaire

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Deployment — ask, do not do**

Report to the user in French with the numbers, then ask, in this order, for explicit approval of:
1. the D1 index — `npx wrangler d1 execute iss-collector --remote --command "CREATE INDEX IF NOT EXISTS liveness_live ON liveness(at) WHERE pushes > 0"` (from `worker/`);
2. the Worker deploy — `npx wrangler deploy` (from `worker/`), which prints the collector's `https://iss-collector.<subdomain>.workers.dev` address; then `curl` its `/status` and check the shape and headers;
3. setting `STATUS_URL` in `src/home/status.ts` to `<that address>/status`, a commit, and the site deploy (push + `wrangler pages deploy`).
Then remind the user to request indexing of `/` and `/console/` in Search Console.
