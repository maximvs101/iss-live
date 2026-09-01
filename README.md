# ISS Live

An educational digital twin of the International Space Station: NASA's public telemetry, orbital
position computed in real time, and 3D exploration of the station module by module.

A fully static web application — no server required, the browser talks directly to both data
sources.

**[iss-live.pages.dev](https://iss-live.pages.dev)** — deployed from `main` on every push.

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

It comes and goes, so this file does not claim to know. The public broadcast was silent from
22/07/2026 01:19 GMT to 28/07/2026, and has gone quiet for stretches of a quarter of an hour since —
which is why the application treats missing data as a first-class state rather than an error, and
why the age it shows is read from the station's own clock rather than from when the packet landed.

To ask:

```bash
npm run check:stream
```

It opens a real TLCP session and separates two things a single number confuses. Subscribing always
yields the last known value of every symbol, whatever the state of the broadcast; only what arrives
*after* that was pushed because the station said something. So the answer has three shapes: nothing
at all, last known values with nothing pushed — a healthy session over an interrupted broadcast —
or a live stream. Only the last exits 0.

The orbital side does not depend on the stream and keeps working regardless.

## Data sources

| Source | Used for | Access |
|---|---|---|
| Lightstreamer `push.lightstreamer.com`, adapter set `ISSLIVE` | 163 telemetry parameters | WebSocket, straight from the browser |
| Celestrak, NORAD object 25544 | orbital elements, propagated with SGP4 | HTTPS, CORS open |
| `github.com/nasa/NASA-3D-Resources` | 3D model of the station | prepared once, served as a static file |
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
| `npm run preview` | serves the built `dist/` as a static host would |
| `npm run build:catalog` | regenerates `src/data/pui-catalog.json` from `data/PUIList.xml` |
| `npm run build:marine` | regenerates the named sea outlines used to say what the station is over |
| `npm run audit:photos` | prints the photograph ranked first for every part, with its URL, so the images can be opened and judged |
| `npm run analyse:offset` | replays a recorded telemetry run through the array geometry — where every wing pointed, minute by minute |
| `npm run build:model` | prepares the NASA 3D model for the web |
| `npm run build:model:mobile` | derives the reduced build a phone can hold in memory |
| `npm run build:earth` | cuts the monthly Blue Marble base maps from NASA's originals |
| `npm run build:detail` | cuts the high-resolution surface tiles the globe overlays |
| `npm run build:icons` | rasterises `favicon.svg` for the platforms that refuse SVG |
| `npm run fix:alpha` | corrects materials the source wrongly declares transparent |
| `npm run check:stream` | is the NASA stream publishing data? |
| `npm run analyse:power` | the array voltage split, and whether the stalled sensors have resumed |
| `npm run verify` | every check below, run together |
| `npm run verify:fast` | the offline checks only, well under a second |
| `npm run inspect:glb` | structure of a GLB file (nodes, triangles, textures) |
| `npm run inspect:joints` | which local axis each joint actually turns about |

The individual `verify:*` scripts, what each one proves and what it cannot, are described in
[Verification](docs/verification.md).

`npm run lint`, `npx tsc -b`, `npm test` and `npm run build` run on every push through GitHub
Actions. Most of the `verify:*` scripts deliberately do not: they open a real Lightstreamer session,
query Celestrak and the image catalogue, and judge live data — which makes them invaluable at
a keyboard and useless in CI, where a quiet stream or a re-indexed catalogue would fail a build that
has nothing wrong with it.

## Publishing

Nothing here needs a server. The page talks to Lightstreamer, Celestrak and NASA's image
catalogue directly, all three over HTTPS, and holds its history in the browser — so any static host
will do, with no secrets to configure and nothing to keep running.

### Two builds of the station, and why

The 3D view crashed the tab on an iPhone, and the cause was not the download. Decoded, the desktop
model occupies about **739 MB**: 108 textures at 1024×1024 become 577 MB of RGBA once mipmapped,
and 4.8 M vertices carry 162 MB of float32 positions, normals and UVs. Every browser on iOS is
WebKit underneath — Chrome included — and WebKit ends a tab's renderer somewhere between 250 and
400 MB. It was not a slow load; it was an execution that could not finish.

`npm run build:model:mobile` derives a second file from the first with its textures at 256, which
is **37 MB instead of 577** and brings the total to 199. The geometry does not follow and cannot:
the model is CAD-derived and hard-edged, 2.5 vertices per triangle because every face owns its
normals, so `weld` finds nothing identical to merge and the simplifier has no shared edges to
collapse — asked for a third of the triangles it returned 97 % of them. Meshopt would have carried
quantization through to the GPU and was rejected on measurement: the file grew to 30 MB and the
node count went from 580 to 751, because quantizing shared meshes inserts scaling nodes, and those
nodes are the clickable modules and the twelve driven joints.

A phone-sized touch screen also gets a pixel ratio of 1 rather than up to 2 — the framebuffer and
its soft-shadow map are the one cost that scales with the square of it — and no hover acceleration
structure, which exists for a pointer that moves every frame and buys nothing under a finger.
`?model=light` and `?model=full` override the choice, on any device.

What decides the choice for the rest is weight. The build is **113 MB**, and a visit that opens the Station view
pulls about **22** of them: the month's base map at 4.1 MB, the cloud layer at 2.2, and the model at
14.9. A visit that stays on the map costs under one. On a host billing 100 GB a month that is
roughly 4,500 Station visits; **Cloudflare Pages** meters no bandwidth on its free plan, which is
why it is the one set up here. Its two hard limits are 25 MiB per file and 20,000 files. The file
count is never going to be the binding one; the per-file limit could be, and the model is the
largest thing here at 14.9 MiB.

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

## Licence

The code is MIT — see [LICENSE](LICENSE).

The data is not mine to license and keeps its own terms. The 3D model comes from NASA's
[NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources); the telemetry is NASA's public ISS
Live broadcast; the orbital elements are Celestrak's; the base maps are NASA Blue Marble; the
coastlines are [Natural Earth](https://www.naturalearthdata.com), public domain. Every source is
listed with its access terms under [Data sources](#data-sources). NASA material is generally free to
reuse but is not covered by the licence above, and NASA does not endorse anything built with it.
