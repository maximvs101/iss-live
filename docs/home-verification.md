# Verifying the home page, the site's bar and the console's move

What was measured before the home page and the navigation were called finished, on 23 September
2026, and how to measure it again.

## Tests and build checks

- Unit tests cover the single navigation list and the page it marks as current, the bar in the
  console, the redirect of old `/?part=` links (run on the script as it stands in the page), the
  folding panels (closed by default, remembered, storage blocked), the position and motion lines,
  the next pass from the remembered city, the collector's `/status` and its reading, the map, the
  assembled home page and the skeleton it is drawn from.
- `npm run build` checks `/`, `/console/`, `/telemetry/` like the other pages (the console's h1 is
  rendered by the application and is exempt from that one check), refuses any generated link to
  `/?part=`, and refuses a first load of the home page that reaches three.js, Lightstreamer or the
  atlas. Shown to bite: with the place names imported statically, the build stops with
  `/ loads _atlas-….js up front`. The first version of that pattern looked for "world-atlas" and let
  the atlas through — the chunk is named after its group, "atlas" — which was also true of the
  `/passes/` check; both are fixed.
- The sitemap lists 12 addresses.

## Lighthouse, mobile, built site

| Page | Performance | Accessibility | Best practices | SEO | Layout shift |
|---|---|---|---|---|---|
| `/` | 98 | 100 | 100 | 100 | 0 |
| `/console/` | 90 | 100 | 100 | 100 | 0.02 |
| `/telemetry/` | 100 | 100 | 100 | 100 | 0 |

The console's performance is within the noise of the page itself: the production console, before
any of this, measured 88 and then 98 in two runs minutes apart on the same machine.

Two findings on the way, both fixed: the home page's live part was empty at first paint and moved
the text below it (layout shift 0.204, performance 89) until its final shape was written in the
HTML; and the console bar's links were 22 px tall, under the 24 px WCAG target (accessibility 96).

## Weight

The home page's first load: the HTML (6 kB), React, satellite.js, the orbit and passes modules and
the static world map (`home-map.svg`, 53 kB, 20 kB compressed). After the first paint it fetches the
place names — the countries atlas and the marine areas, about 128 kB compressed — for the phrase
"Over the South Pacific Ocean". Neither three.js nor Lightstreamer is ever reached from `/`.

## The console's dimensions

The site's bar sits on its own 33 px row above the console's header: inside the header it pushed the
view buttons to a second row (header 64 → 99 px at 1366 wide), and letting the stream status shrink
instead sent its message to five lines (header 191 px). Against the production console:

| Screen | Map | Reading rows visible |
|---|---|---|
| 1920 × 1080 | 994 × 498, unchanged | 32 → 32 |
| 1366 × 768 | 490 × 246, unchanged | 24 → 21 |
| 1292 × 677 | 487 × 245, unchanged | 15 → 14 |

The map keeps every pixel; the readings pay for the bar with one to three rows on short screens.

## Still to do, and needing approval

- The D1 partial index and the Worker with `/status`, then `STATUS_URL` set to its address — until
  then the home page leaves the NASA line out.
- Request indexing of `/` and `/console/` in Search Console after the deploy.
