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
- a different visible / not-visible call — visible meaning high enough, lit, under a dark sky, and
  for at least a minute on one unbroken stretch — unless the call itself flips when the thresholds
  (10° elevation, −6° Sun, 60 s) move by their tolerance, 0.5° and 10 s, or two stretches are within
  10 s of each other in length — reported as *marginal*;
- the start or end of the visible stretch — the times the list and the calendar show — more than
  10 s apart.

Result on 23 September 2026, Celestrak's current set:
`158 passes checked over 6 sites, 0 marginal, 0 failure(s)`.

Each comparison has been shown to fail when it should:

| Sabotage | Result |
|---|---|
| elevation threshold set to 15° on the page's side | 4 failures |
| the one-minute rule removed on Skyfield's side | 4 failures |
| the visible end shifted by 20 s | 17 failures |

The first version of the verifier could not fail at all: it called a pass marginal whenever its
track came within 0.5° of 10°, which every pass above 10° does twice, so every disagreement was
excused. The second measured the minute from the first visible instant to the last, as the page
then did, so two glimpses of seconds either side of the shadow passed on both sides at once — the
final review found it.

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

## Brightness, against Heavens-Above

Heavens-Above's visible passes over Paris (48.8566° N, 2.3522° E, 35 m) for 23–29 September 2026,
beside the page's estimate — its brightest point on the visible stretch — computed from Celestrak's
set of 22 September (epoch 26265.85):

| Visible from (Paris time) | Highest | Heavens-Above | Page | Difference | Heavens-Above's figure, in the page's words | Page's word |
|---|---|---|---|---|---|---|
| 23 Sep 20:30:25 | 76° | −3.7 | −4.2 | −0.5 | very bright | very bright |
| 23 Sep 22:07:27 | 26° | −1.9 | −1.4 | +0.5 | bright | bright |
| 24 Sep 21:19:37 | 41° | −2.9 | −3.3 | −0.4 | very bright | very bright |
| 25 Sep 20:31:52 | 61° | −3.4 | −3.8 | −0.4 | very bright | very bright |
| 25 Sep 22:09:52 | 13° | −1.0 | −0.6 | +0.4 | bright | visible but faint |
| 26 Sep 21:21:27 | 19° | −1.5 | −1.8 | −0.3 | bright | bright |
| 27 Sep 20:33:24 | 28° | −2.0 | −2.3 | −0.3 | bright | bright |
| 29 Sep 20:35:39 | 13° | −0.9 | −0.8 | +0.1 | visible but faint | visible but faint |

The mean difference is −0.1 magnitude, the mean of its size 0.4, the largest 0.5. Not systematic: the
page is a little brighter on the high passes and a little fainter on the two that end in the shadow,
where the brightness changes fastest. The plan's rule was to adjust the standard magnitude once if the
bias passed 0.7 on average; at −0.1 it stays at −1.8. Seven words in eight agree; the eighth is a pass
Heavens-Above puts at exactly −1.0, on the line between two words, which a ±1 model cannot promise.

The same table checks the times against a third predictor, with its own elements: every start agrees
to within a second, and so do the highest points and the ends given by both.

## Still to do

- **The sky.** A visible pass watched from the ground, at the time and in the direction given.
