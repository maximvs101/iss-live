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
| `npm run preview` | serves the built `dist/` as a static host would |
| `npm run build:catalog` | regenerates `src/data/pui-catalog.json` from `data/PUIList.xml` |
| `npm run build:model` | prepares the NASA 3D model for the web |
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

## The collector

The site has no server, and still does not. `worker/` is a separate Cloudflare Worker in the same
account, deployed on its own, which the Pages project neither builds nor knows about.

It existed because some questions need a week of observation rather than a clever idea, and sampling
by hand kept producing answers to questions nobody asked. A capture every few minutes cannot tell a
frozen value from an unchanged one, and every fresh subscription hands back a snapshot that looks
exactly like data — convincingly, since the per-symbol timestamps are quoted against `TIME_000001`,
which freezes with everything else, so a six-hour-old snapshot reads as perfectly fresh against its
own clock. A sampling run across a whole orbit once reported "no split anywhere" when what it had
recorded was ninety-eight minutes of identical numbers over a dead broadcast.

The only sound test is arithmetic: one update per symbol is the server's memory, a second is the
station speaking. A cron fired once a minute, listened for ten seconds, and wrote to D1 how many
updates went beyond the snapshot. A reading is stored only when it changes, so a dead broadcast
leaves no trace rather than a week of identical rows.

```
https://iss-collector.mjoly-pm.workers.dev/report
```

The report answers against live minutes, never elapsed ones, and says "too little live data" rather
than "no" when there is nothing behind the question. That distinction is the whole reason it exists.

**It ran from 11 to 16 August 2026 and is now stopped.** The questions it was built for are settled,
and what remained was surveillance rather than investigation. The cron list in `wrangler.jsonc` is
emptied rather than deleted so the stop is legible; restoring `["* * * * *"]` and redeploying starts
it again. The worker, the report endpoint and all **1,454 readings** stay where they are.

### What it settled

**The two voltage levels are orbital night and day.** Every one of the 141 readings taken in
Earth's shadow sits below 155 V, without a single exception, averaging 151.2 V across a range of
0.7 V. In sunlight only 53 % do, spread from 151.4 to 160.6 V. The asymmetry is the interesting
half: with no light there is nothing the arrays can do, but a lit array is not necessarily charging
— once the batteries are full the regulation shunts and the bus falls back to the same 151 V. The
shadow is computed from the orbital elements with `shadowFraction()`, so the two sides of that
correlation share nothing.

**The split between array voltages is a transition lag, not a state.** The eight channels do not
cross between the two levels at the same instant, and **3A is consistently last** — in the low group
in 13 of the 15 readings that caught a split, against 2 of 15 for 1A and 4A. Widest spread seen:
9.28 V. This is why membership never tracked each wing's pointing: there is no steady configuration
to correlate against, only who has arrived and who has not.

**The beta angle the application propagates matches the one the station publishes**, over 186
comparisons spanning 15° of excursion: mean difference −0.001°, median 0.002°, **RMS 0.039°**, worst
case 0.53°. The error does not grow when the orbital elements are extrapolated five days backwards
(−0.005° against −0.000°), which places it in neither the propagation nor the epoch handling.
`propagator.ts` had carried this comparison as a promise since the first commit; a silent broadcast
was what made it impossible.

**The frozen sensors are frozen per symbol, not per module.** Destiny's and Tranquility's partial
pressures, the O₂ production rate and station mass have not moved since 11/08 16:45 — five days
during which the joint angles and array voltages changed every minute. Cabin pressure, in the same
module and the same discipline as the ppO₂ that is stuck, is live throughout at 752.3 mmHg with 81
distinct changes. So this is not a subsystem failing aboard; it is symbol-by-symbol in the
broadcast chain.

### What it cost to make it honest

The collector spent most of its life recording 16 % of the minutes it was asked to, in blocks: runs
of 40 to 94 consecutive minutes where every invocation was killed as `exceededResources` and wrote
nothing at all. That failure mode is the worst available here, since an hour of missing rows and an
hour of dead broadcast look identical.

The cause was not the parsing, which a synthetic bench measures flat at 0.3 µs a line and 0.57 ms
for 3,200 of them. It was the **number of times the stream is read**: 219 of them for ten seconds of
a busy broadcast. The bill follows: a busy minute cost 169, 316 and 167 ms of CPU where a quiet one,
reading a handful of keep-alives, cost 4.7. Cloudflare's free plan tolerates that in bursts and then
clamps for an hour, which is what produced the blocks.

The fix is to ask the server for less rather than drain what it offers: `LS_requested_max_frequency`
at 0.2 Hz brings the same ten seconds down to **17 reads**, keeping all 27 symbols and 25 pushes —
the broadcast is still visibly alive. Verified against the real server rather than assumed, because
a subscription that had silently failed would report zero pushes forever and read exactly like an
outage. Measured after: **81 invocations, 81 successes, no kills**, median 7.7 ms.

Worth recording alongside it: the first attempt at this fix was reported as working on the strength
of 36 clean minutes, and was not. The full record showed 147 successes in 916. A window that short
cannot see a failure whose period is an hour, and the honest figure only appeared from measuring
across the whole interval.

One trap for anything reading this broadcast: when the feed resumed on 11/08 at 16:44:45, **all
eight array voltages read exactly 0.00 V for one minute** before returning to 159–160 V. Eight
arrays at exactly zero simultaneously is not a measurement, it is the initial value pushed on
reconnection — and a display taking it at face value would announce a station without power.

## Still to do

- Pin down the absolute zero of each **beta** joint. The alpha chain is settled: `best reachable` in
  `verify:arrays` is the residual no beta angle can remove, so it belongs to the alpha joints alone,
  and it reads one to two degrees. The beta zeros are not, and they are confounded with the station's
  own off-pointing — both put every wing the same distance off the Sun, and a constant zero error
  even wears the splay's signature, since the model's rest orientations are already mirrored between
  the two wings of a mast. What separates them is beta: a zero error is constant, a deliberate
  off-point follows the Sun out of the orbital plane. Each run of `verify:arrays` now appends its
  measurement to `data/array-offsets.jsonl`, and the answer falls out once the samples span about 8°
  of beta — a handful of runs across a week.
- The four operational gyroscopes sit inside the Z1 truss and are not modelled separately, so their
  telemetry is attached to `truss-z1` rather than to parts of their own.
- Whether a value of exactly zero is ever displayed as one. The broadcast pushed 0.00 V on all eight
  array channels for a single minute on reconnection (see [the collector](#the-collector)), and
  nothing in the application currently distinguishes that from a reading. It is the same class of
  problem as a frozen value read as a fresh one, and it has not been looked at.
- Whether the stalled atmosphere sensors ever resume, which nothing is watching now that the
  collector is stopped. As of 16/08/2026 they had not: Destiny's and Tranquility's partial
  pressures, the O₂ production rate and station mass were unchanged since 11/08 16:45. The question
  that used to sit here — whether the partial pressures could be summed — is answered and the answer
  is no, but for a plainer reason than the ages suggested: they are not contemporaneous with
  anything, cabin pressure included, and cabin pressure is live.
- How long the broadcast is actually up over a week. This is the one question the collector was
  meant to answer and did not, because for most of its run it was itself absent 84 % of the time in
  hour-long blocks — a record of the collector's health, not the broadcast's. It ran correctly for
  roughly ninety minutes before being stopped, which is not a week. Answering it means restarting
  the cron and leaving it alone.
- NASA's **(E) Internal** model (a multipart 7z archive of 330 MB) would allow exploring the inside
  of the modules; it has not been processed.
- The `three` chunk is still 725 kB. Both views need it, so deferring it would only move the wait.
- The 3D scene is untested. jsdom has no WebGL, so what runs against it is the arithmetic —
  `verify:render`, `verify:camera`, `verify:scene` — while the image itself is checked by eye. The
  React components around it are covered: the map is held to the projection at their seam, and the
  chart, the passes panel, the error boundary and the photo gallery have tests of their own.
- `verify:arrays` recognises an off-Sun configuration by a three-part signature rather than by
  measuring it, so it lets one through rather than calling a healthy station broken. A defect
  symmetric enough to imitate a splay in all three respects passes — the beta zeros above being
  exactly such a defect, which is why they are logged rather than assumed innocent.

## Licence

The code is MIT — see [LICENSE](LICENSE).

The data is not mine to license and keeps its own terms. The 3D model comes from NASA's
[NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources); the telemetry is NASA's public ISS
Live broadcast; the orbital elements are Celestrak's; the base maps are NASA Blue Marble; the
coastlines are [Natural Earth](https://www.naturalearthdata.com), public domain. Every source is
listed with its access terms under [Data sources](#data-sources). NASA material is generally free to
reuse but is not covered by the licence above, and NASA does not endorse anything built with it.
