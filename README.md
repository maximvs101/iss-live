# ISS Live

An educational digital twin of the International Space Station: NASA's public telemetry, orbital
position computed in real time, and 3D exploration of the station module by module.

A fully static web application — no server required, the browser talks directly to both data
sources.

## Documentation

This file is the short version. The reasoning behind the code lives in `docs/`, where it can be
long without being in the way.

| | |
|---|---|
| [Architecture](docs/architecture.md) | how the application is put together, module by module, and why each part is the way it is |
| [The 3D model](docs/the-3d-model.md) | where NASA's model comes from, how 91 MB became 15, and how its joints map to telemetry |
| [Reading the telemetry](docs/reading-the-telemetry.md) | the reference documents that settle what each symbol means — the catalogue names them but does not explain them |
| [Verification](docs/verification.md) | what is checked, against what, and what has been measured rather than assumed |
| [Technical notes](docs/technical-notes.md) | the traps found along the way, kept so they are not rediscovered |

## State of the telemetry source

**The stream is live.** The public ISS Live broadcast had been silent from 22/07/2026 01:19 GMT
and resumed on 28/07/2026; the application was built and verified through that outage, which is
why it treats missing data as a first-class state rather than an error.

To check the stream at any time:

```bash
npm run check:stream
```

The script opens a real TLCP session and reports how many updates arrived. Exit code 0 if data is
flowing, 1 if the server responds but publishes nothing.

The orbital side does not depend on that stream and keeps working regardless.

## Data sources

| Source | Used for | Access |
|---|---|---|
| Lightstreamer `push.lightstreamer.com`, adapter set `ISSLIVE` | 163 telemetry parameters | WebSocket, straight from the browser |
| Celestrak, NORAD object 25544 | orbital elements, propagated with SGP4 | HTTPS, CORS open |
| `github.com/nasa/NASA-3D-Resources` | 3D model of the station | prepared once, served as a static file |
| NASA DONKI, at Goddard's CCMC | solar flares and geomagnetic storms | JSON, **no key**, CORS open |
| NASA Image and Video Library | a photograph of the selected part | JSON + HTTPS assets, no key, CORS open |

Worth knowing: the `science.nasa.gov` pages offer the 3D models only as FBX and 7z archives, but
the official GitHub repository publishes directly usable GLB files — including the IGOAL model,
which is structured by module and by joint.

The catalogue of public symbols (298 entries, 15 disciplines) comes from the `PUIList.xml` file
shipped with the Lightstreamer reference client. It is converted into typed JSON by
`npm run build:catalog`. What the symbols actually *mean* is a separate problem, and the sources
that settle it are in [Reading the telemetry](docs/reading-the-telemetry.md).

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build into `dist/` |
| `npm test` | unit tests (`npm run test:watch` to keep them running) |
| `npm run build:catalog` | regenerates `src/data/pui-catalog.json` from `data/PUIList.xml` |
| `npm run build:model` | prepares the NASA 3D model for the web |
| `npm run fix:alpha` | corrects materials the source wrongly declares transparent |
| `npm run check:stream` | is the NASA stream publishing data? |
| `npm run verify` | every check below, run together |
| `npm run verify:fast` | the offline checks only, well under a second |
| `npm run inspect:glb` | structure of a GLB file (nodes, triangles, textures) |
| `npm run inspect:joints` | which local axis each joint actually turns about |

The individual `verify:*` scripts, what each one proves and what it cannot, are described in
[Verification](docs/verification.md).

`npm run lint`, `npx tsc -b`, `npm test` and `npm run build` run on every push through GitHub
Actions. Most of the `verify:*` scripts deliberately do not: they open a real Lightstreamer session,
query Celestrak, DONKI and the image catalogue, and judge live data — which makes them invaluable at
a keyboard and useless in CI, where a quiet stream or a re-indexed catalogue would fail a build that
has nothing wrong with it.

## Publishing

Nothing here needs a server. The page talks to Lightstreamer, Celestrak, DONKI and NASA's image
catalogue directly, all four over HTTPS, and holds its history in the browser — so any static host
will do, with no secrets to configure and nothing to keep running.

What decides the choice is weight. The build is **113 MB**, and a visit that opens the Station view
pulls about **22** of them: the month's base map at 4.1 MB, the cloud layer at 2.2, and the model at
14.9. A visit that stays on the map costs under one. On a host billing 100 GB a month that is
roughly 4,500 Station visits; **Cloudflare Pages** meters no bandwidth on its free plan, which is
why it is the one set up here. Its two hard limits are 25 MiB per file and 20,000 files, against a
largest file of 14.9 MiB and 154 of them.

```bash
npm run build
npx wrangler pages deploy dist --project-name iss-live
```

For a deployment driven from a repository instead, the settings are: build command `npm run build`
and output directory `dist`. The Node version is not one of them: Cloudflare reads `.nvmrc`, and so
does the CI workflow. That file is the only place the version is written, deliberately — npm 10 and
npm 11 disagree about this project's lock file, so a version stated twice is a deploy waiting to
fail on `npm ci` (see [technical notes](docs/technical-notes.md)).

`public/_headers` carries the cache policy and is copied to the root of `dist/`, where Cloudflare
Pages and Netlify both read it — one statement of the rules rather than one per host. It matters
more than it looks: the hashed chunks under `/assets` are cached for a year, the unhashed textures,
model and Draco decoder for a week with background revalidation, and `index.html` not at all, since
it is the only file naming the hashed chunks and a stale copy would point at the previous ones.

`base` is left at `/`, so the site must be served from the root of a domain or subdomain. A
deployment under a path — a project page on GitHub Pages, say — would need that set first.

There is no `_redirects` file, and it would be dead weight: the application keeps its state in the
query string rather than in paths, so there is no route for a static host to fail to resolve.

## Still to do

- Pin down the absolute zero of each joint angle against a reference image of the station.
- The four operational gyroscopes sit inside the Z1 truss and are not modelled separately, so their
  telemetry is attached to `truss-z1` rather than to parts of their own.
- Which channels sit in the high-voltage group during sunlight, and whether membership tracks each
  wing's own illumination. The eclipse case is settled; the sunlit one is only observed.
- Whether the stalled atmosphere sensors ever resume. If they do, the two modules can finally be
  compared at the same instant.
- NASA's **(E) Internal** model (a multipart 7z archive of 330 MB) would allow exploring the inside
  of the modules; it has not been processed.
- The `three` chunk is still 725 kB. Both views need it, so deferring it would only move the wait.
- The 3D scene is untested. jsdom has no WebGL, so what runs against it is the arithmetic —
  `verify:render`, `verify:camera`, `verify:scene` — while the image itself is checked by eye. The
  React components around it are covered: the map is held to the projection at their seam, and the
  chart, the passes panel, the error boundary and the photo gallery have tests of their own.
- The station's arrays are sometimes deliberately off-Sun, and `verify:arrays` recognises that by a
  three-part signature rather than by measuring it. A defect symmetric enough to imitate a splay in
  all three respects would pass.

## Licence

The code is MIT — see [LICENSE](LICENSE).

The data is not mine to license and keeps its own terms. The 3D model comes from NASA's
[NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources); the telemetry is NASA's public ISS
Live broadcast; the orbital elements are Celestrak's; the base maps are NASA Blue Marble; the
coastlines are [Natural Earth](https://www.naturalearthdata.com), public domain. Every source is
listed with its access terms under [Data sources](#data-sources). NASA material is generally free to
reuse but is not covered by the licence above, and NASA does not endorse anything built with it.
