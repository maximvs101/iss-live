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
- **Ray casting goes through a BVH** (`<Bvh>` from drei). Testing the ray against the raw triangles
  of 555 meshes measured 3.8 ms on average and 21 ms at worst — enough to drop frames as the cursor
  sweeps the station. With the bounding volume hierarchy: 1.3 ms on average, 4.4 ms at worst.
