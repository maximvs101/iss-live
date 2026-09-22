# Verifying the passes page

What was measured before `/passes/` was called finished, and how to measure it again.

## Times, against an independent implementation

`npm run verify:passes -- [iss.tle]` computes five days of passes over six places chosen for their
awkward cases — Paris, Tromsø (twilight nights, grazing passes), Quito (equator), Ushuaia (far
south), Tokyo, Honolulu (near the date line) — with the page's own `findPasses`, then again with
**Skyfield** (Python: the reference `sgp4` library, JPL's DE421 for the Sun, its own root-finder).
Nothing is shared but the element set. The script fails on any of:

- a pass one side finds and the other does not;
- rise, culmination or set more than 10 s apart;
- maximum elevation more than 0.5° apart;
- a different visible / not-visible call, unless the call itself flips when both thresholds
  (10° elevation, −6° Sun) move by 0.5° — reported as *marginal*.

Result on 22 September 2026, Celestrak's current set:
`155 passes checked over 6 sites, 1 marginal, 0 failure(s)`.

It can fail. With the elevation threshold deliberately set to 15°:
`155 passes checked over 6 sites, 2 marginal, 4 failure(s)`, exit 1. The first version of the
verifier could not: it called a pass marginal whenever its track came within 0.5° of 10°, which
every pass above 10° does twice, so every disagreement was excused.

Needs `python -m pip install skyfield`; DE421 (17 MB) is fetched into `.cache/skyfield/` on the
first run.

## The page

Lighthouse, mobile, on the built site (`npm run build`, then `npm run preview`):

| URL | Performance | Accessibility | Best practices | SEO | Layout shift |
|---|---|---|---|---|---|
| `/passes/` | 99 | 100 | 100 | 100 | 0.05 |
| `/passes/?city=paris-fr` | 99 | 100 | 100 | 100 | 0 |

Before the room for the list was claimed in the page's head, the second line read performance 79
and layout shift 0.449.

Weight of a first visit: 88 kB transferred over 10 requests (React 58 kB, satellite.js 12 kB, the
page's own script 7 kB, the HTML 4 kB); with a city link, 107 kB, the city file (`p.json`) being
19 kB of it. The largest city file, `s.json`, is 35 kB compressed.

Computing five days: 31 passes over Paris in 19 ms (Node, warm).

## Still to do

- **Brightness against Heavens-Above.** Not done: the words (`very bright` ≤ −2.5, `bright` ≤ −1)
  rest on a diffuse-sphere model with a standard magnitude of −1.8 and have not been compared with
  another predictor. To do: ten visible passes over Paris, our estimate beside Heavens-Above's
  magnitude; adjust the standard magnitude once if the difference is systematic.
- **The sky.** A visible pass watched from the ground, at the time and in the direction given.
