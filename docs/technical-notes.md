# Technical notes

- **The catalogue's units are wrong in places.** The file dates from 2011: `CNT` for degrees
  Celsius, `DEGF` for values already in Celsius, `FT-LB` for N·m. `src/telemetry/units.ts` carries
  a correction table, each entry marked `description` (the unit is spelled out in the catalogue
  description) or `inferred` (deduced from magnitudes, to be reconfirmed against real data).
- **Catalogue anomaly.** Symbols `S4000004`/`S4000005` are labelled "3B" although the S4 segment
  carries channels 1A and 3A. The application keeps the physical position.
- **Loss-of-signal detection** is based on the age of the last update, not on the `Status.Class`
  field of `TIME_000001`, whose semantics could not be confirmed against real data.
- **The two S-band groups are attached by geometry, not by name.** Nothing in the catalogue links
  a radio frequency group to an antenna assembly. The Mimic C&T chapter places RFG1 on the S1
  truss and RFG2 on P1; composing full node transforms in the model puts `Truss_S1` at z=+1.5 and
  `Truss_P1` at z=−1.5, and `Payload_SASA2` at z=+0.7 against `SASA3` at z=−2.5. Starboard SASA2
  therefore carries RFG1. Only the *side* is firm — SASA3 sits further outboard than P1 itself —
  but the side is all the attachment needs.
- **A grid track sized `1fr` will not shrink below its content.** The coordinate form for passes
  overhead pushed the 400 px side column wider and stole the space from the map. The cause is that
  `min-width` defaults to `auto` on a grid item, and an `<input>` reports its min-content width as
  its default twenty characters — 205 px here, so two of them plus a button asked for 451 px inside
  352. Measured rather than guessed: `scrollWidth` 483 against `clientWidth` 384. `min-width: 0` on
  the inputs and on the side column fixes it, and the columns now resolve to 147 + 147 + 41.
- **A source link can return HTTP 200 and still be wrong.** `isslive.com` answers 200 and redirects
  to a domain-for-sale page; `isslive.nasa.gov` no longer resolves at all. Checking status codes
  would have shipped the first. The sources dialog credits Lightstreamer's reference client, which
  is also where `PUIList.xml` comes from, and a unit test pins every host by name — the one thing a
  status check cannot verify.
- **ES-format workers.** `satellite.js` embeds a WebAssembly module whose worker uses top-level
  `await`; `vite.config.ts` forces `worker.format: 'es'`, without which the production build fails.
- **The model pipeline uses @gltf-transform's JavaScript API, not its CLI.** The command-line tool
  pulls in an argument parser whose dependency chain (caporal → glob → minimatch →
  brace-expansion) carried eight permanent high-severity advisories with no non-breaking fix:
  `npm audit fix --force` "resolved" them by downgrading the CLI two major versions, while 4.4.2
  is the current release. Overriding `brace-expansion` to ^5.0.8 silenced the audit and **broke
  the build** — version 5 drops the default export that `minimatch@9` imports, so
  `gltf-transform dedup` died with a `SyntaxError`, though `inspect` still worked and a shallow
  check would have missed it. Rewriting the six steps against `@gltf-transform/core` removed the
  CLI altogether: **0 vulnerabilities**, and the output is byte-identical to what the CLI
  produced — 15,609,824 bytes, the same 580 node names, the same 42 materials. A `sharp` override
  to ^0.35.3 stays, to clear the libvips advisories that `ndarray-pixels` would otherwise pin
  to 0.34.
- **The 3D engine is not in the first load.** Only the Station view needs three.js, and the map
  opens first, so `StationView` is imported with `React.lazy`. Measured on the production build:
  **216 kB over 7 files** to draw the map, and the remaining 279 kB — the view itself, three.core,
  the glTF and Draco loaders — fetched only when the Station tab is opened. It was 437 kB up front
  while a 3D globe shared those libraries.

  **Manual chunking silently defeats this, twice over.** A named group becomes a *static* chunk,
  Vite writes a `modulepreload` for it, and the browser fetches it before the map has finished
  drawing — the lazy boundary is still there, and it buys nothing. `three` and `@react-three` are
  therefore deliberately absent from `advancedChunks`. The same trap had already caught the glTF
  loaders, where a `three` rule matching `three/examples` reduced the emitted loader chunk to a
  0.06 kB stub. Check `dist/index.html` after touching that config: what it preloads *is* the
  first load.

  What remains grouped is split by lifetime rather than by view: React, the Lightstreamer client,
  satellite.js and the map data change almost never, while the application code is 37 kB. In one
  chunk, editing a label invalidated all of it.
- **No 3D loading through suspension.** The model is loaded explicitly
  (`src/scene/nasa/useIssModel.ts`): when a component suspends inside a canvas, the whole scene
  stops being painted, and no progress can be reported while it does.
- **The lighting keeps a floor.** The station spends a third of its orbit in shadow; cutting all
  light would be faithful but would leave a black screen every other half-hour.
- **Hover is read on pointer *move*, not pointer *over*.** The whole NASA model is a single React
  object, so crossing from one module to the next does not necessarily produce a new "over" event —
  the pointer never left the primitive.
- **One Node version, named in one place, and the lock file is why.** npm 10 and npm 11 do not
  agree about the optional native dependencies of the build toolchain: a lock written by one is
  rejected by the other with `Missing: @emnapi/core from lock file`, and each rewrites what the
  other wrote on the next install. Left alone the file oscillates and the deploy fails on whichever
  machine did not touch it last — which is exactly how the first Cloudflare build died, before it
  reached the compiler. `.nvmrc` is the single statement of the version; the CI workflow reads it
  through `node-version-file` rather than repeating the number, Cloudflare reads it by itself, and
  `packageManager` and `engines` say the same thing to anyone installing by hand. A dry run does
  not settle it — reproduce the host's install with a real `npm ci`.
- **`npm audit` reports a high-severity finding, and it is not in the site.** `nanoid@3.3.16`,
  reached through `vite → postcss`. It runs while the bundle is being built, on this repository's
  own source, and is absent from everything published — checked against the emitted chunks, not
  assumed. `npm audit fix` offers no non-breaking resolution, so forcing it would mean moving Vite
  for a component that never reaches a visitor.
- **Ray casting goes through a BVH** (`<Bvh>` from drei). Testing the ray against the raw triangles
  of 555 meshes measured 3.8 ms on average and 21 ms at worst — enough to drop frames as the cursor
  sweeps the station. With the bounding volume hierarchy: 1.3 ms on average, 4.4 ms at worst.
- **Reading a stream costs more than parsing it.** The collector was being killed on Cloudflare's
  CPU allowance and the parser looked like the obvious suspect, so it was rewritten to scan with
  `indexOf` and read with `slice` instead of allocating arrays per line. That was not the cost: a
  synthetic bench puts the parse loop at **0.3 µs a line**, flat, 0.57 ms for 3,200 lines. What
  costs is how many times the stream has to be read — **219 reads** for ten seconds of a busy
  broadcast, and a busy minute burned 169 to 316 ms of CPU where a quiet one burned 4.7. The fix is
  upstream of the code entirely: `LS_requested_max_frequency` at 0.2 Hz brings the same window to
  **17 reads** while still delivering all 27 symbols and 25 pushes. Ask the server for less before
  optimising the loop that drains it.
- **A guard against a hang can be the leak.** The same listen loop raced `reader.read()` against a
  deadline, and built a fresh `setTimeout` on every iteration without ever clearing one — two
  hundred live timers on a busy minute, all queued to fire at the same instant. One timer for the
  whole listen, cleared in `finally`.
- **A short clean window cannot clear a fault whose period is an hour.** The first attempt at the
  CPU fix was reported as working on 36 consecutive successes. The full record showed **147 in
  916**: the failures came in runs of 40 to 94 minutes, so any window shorter than that could land
  entirely inside a good run. Where the failure is bursty, the measurement has to outlast the burst,
  and the honest figure only appears from the whole interval.
- **The broadcast pushes zeros when it reconnects.** On 11/08/2026 at 16:44:45, **22 of the 25
  symbols under observation published exactly `0` in the same instant** — all eight array voltages,
  all eight BGA angles, both SARJs, station mass — and were back to normal values a minute later,
  the arrays at 159–160 V. Cabin pressure, the measured beta angle and the onboard clock carried
  real values throughout, so it is not a blanket reset of everything. Nothing in the application
  distinguishes that from a reading, and nothing here proposes a rule: this has been seen **once**,
  and a heuristic fitted to a single occurrence is how a display starts hiding real data. It is
  recorded so the second occurrence is recognised rather than rediscovered.
