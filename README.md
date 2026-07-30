# ISS Live

An educational digital twin of the International Space Station: NASA's public telemetry, orbital
position computed in real time, and 3D exploration of the station module by module.

A fully static web application — no server required, the browser talks directly to both data
sources.

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
`npm run build:catalog`.

### Reading the telemetry

The catalogue names the symbols but does not say how to interpret them. These do:

| Document | What it settles |
|---|---|
| [ISS Mimic Telemetry Screens](https://docs.google.com/presentation/d/11LBGKdbBd1ZbKKpKJ8Y54hAPogtyMLfRmvKoN2bRaHQ/edit) | which readings are **not working**, wing naming, TRRJ modes, antenna geometry, station modes |
| [Lightstreamer ISS Live demo](https://demos.lightstreamer.com/ISSLive/) | the reference rendering, including the `day/HH:MM:SS` time format and per-symbol timestamps |
| issmimic.space [ch. 2](https://www.issmimic.space/chapter2), [ch. 4](https://www.issmimic.space/chapter4), [ch. 5](https://www.issmimic.space/chapter5) | the water loops, the RFG-to-antenna assignment, the airlock leak-check hold |

The Mimic deck is the useful one, because it is candid about its own gaps. It labels the
electrical current readout "not working" and the total power usage "not working currently" —
which is what independently confirms the frozen channels found below.

The site's telemetry guide links only chapters 1 and 2, but **chapters 3, 4 and 5 exist and are
unlinked** (6 and beyond return 404). Chapter 4 is the most valuable of the five: it is what
settled the RFG-to-antenna assignment the code had previously refused to guess.

Chapter 5 also confirms the pressure unit from the other direction. It renders the airlock gauge
at **14.53 psi** while the raw symbol reads 749.26 — that is 14.49 psi. Mimic is converting a
value that arrives in mmHg, which corroborates the correction made here against a catalogue that
claims PSIA.

**Chapter 1 is wrong twice, and is not used.** It places channels 1A/1B/3A/3B on the port side and
2A/2B/4A/4B on starboard — the reverse of the truth, and the reverse of what the project's own
slide deck says ("even is the port, odd is the starboard"). The catalogue settles it without
appeal, because the segment is part of the symbol name: `S4000007` (**S**tarboard 4) is channel
1A, `P4000007` (**P**ort 4) is channel 2A. The same page lists the six iROSA arrays as 1A, 2B, 3A,
3B, 4A, 4B, where the NASA model carries `S41A`, `S43A`, `S61B`, `P44A`, `P62B`, `P64B` — 1B, not
3B, which matches the real installation order (2B/4B in 2021, 3A/4A in 2022, 1A/1B in 2023).
Chapter 1 also reads the frozen 0.00 A as "no current draw at that time", the interpretation its
own slide deck rules out. Across all five chapters the descriptive passages are sound and the
screen-reading commentary is not — several read as machine-written around a screenshot ("It's
likely part of the ISS Power and Thermal Control training interface"), and chapter 3's docking
configuration is frozen at 2024 (Crew-8, NG-20). Only the descriptive material is used here.

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
| `npm run verify:orbit` | compares the orbital engine against an independent source |
| `npm run verify:scene` | consistency of parts, telemetry attachments and cited symbols |
| `npm run verify:model` | joints and node coverage of the 3D model |
| `npm run verify:passes` | upcoming passes over a location, with consistency checks |
| `npm run verify:telemetry` | every subscribed channel against ranges, internal consistency and SGP4 |
| `npm run verify:plottable` | whether every channel offered for plotting is still being measured |
| `npm run verify:media` | whether each curated image search still finds its own hardware |

`npm run lint`, `npx tsc -b`, `npm test` and `npm run build` run on every push through GitHub
Actions. The `verify:*` scripts deliberately do not: they open a real Lightstreamer session, query
Celestrak, DONKI and the image catalogue, and judge live data — which makes them invaluable at a
keyboard and useless in CI, where a quiet stream or a re-indexed catalogue would fail a build that
has nothing wrong with it.
| `npm run inspect:glb` | structure of a GLB file (nodes, triangles, textures) |
| `npm run inspect:joints` | which local axis each joint actually turns about |

## Architecture

```
src/
├── telemetry/     Lightstreamer client, state, stream health, units, subsystem grouping
├── orbit/         orbital elements, SGP4 propagation, Sun–Earth–station geometry
├── scene/         flat map, NASA 3D model, part selection
├── ui/            panels, SVG charts, deep links
├── history/       local history in IndexedDB
└── data/          catalogue of public symbols
```

### One reading level, not three

There were three — Discovery, Engineering, Education — and two of them were the same numbers with
the symbol identifiers hidden and a paragraph of prose added. A switch is only worth its place if
the thing behind it is worth switching to, and neither of those was: the explanations belong beside
the values, not behind a mode. Every channel's explanation is now on its label's tooltip, and the
inspector still prints it in full for the part you select. What went was the switch, the two modes,
five teaching cards, and the conditionals that made components behave differently depending on
which mode was current.

### Space weather, and only the part of it that reaches the station

DONKI is NASA's space weather database, and most of what it publishes is upstream of anything a
crew would notice. Two event types are not. A large **solar flare** raises the radiation dose on
board. A **geomagnetic storm** heats the thermosphere until the air at 420 km thickens, drag rises
and the orbit decays faster — which shows up in the very elements this application propagates.
Coronal mass ejections, particle events and shocks are the causes of those two and are left out;
listing everything would bury the two that matter.

**No API key, deliberately.** `api.nasa.gov` mirrors DONKI and wants one, and a key in a static
page is a key published to the world. Goddard's CCMC serves the same data straight, with
`Access-Control-Allow-Origin: *`.

Two readings of the data turned out to be wrong on contact with it. The first was mine: 67 of 76
flares in the window came back at M-class or above, which looked like a classification bug, because
C-class normally dominates by count. It is not a bug — checked against the raw feed, the month was
65 M, 2 X and 9 C. The Sun is near the maximum of cycle 25.

Which exposed the second: the panel's summary said "67 flares at M+", and near solar maximum that
number describes the Sun's cycle rather than the month. It now names the largest event — `flare
X1.3` — and the list is sorted by flux rather than by date, because a list of the five most recent
was five M1s while both X-class events sat sixty rows down. Sorting by flux is also why
`flareFlux` exists: each class letter is a decade, so a string comparison puts C9.9 above M1.0.

### A photograph of the thing you just clicked

The 3D model says where a part is and the telemetry says what it is doing; neither says what it
looks like. The Image and Video Library fills that in, keyless and CORS-open, with assets served
over HTTPS.

**Searches are curated and checked, never derived from a label.** Free text was the first attempt
and it failed in a way that reads as success: every query returns *something*. Searching everything
for "Harmony" returned a photograph titled *HTV-4* — a cargo vehicle — and "Rassvet" returned some
chemistry-education hardware, because NASA's captions name half the station apiece and a
description match will hit almost anything. Matching on the **title** instead fixed all of them.

The first version of `verify:media` had the same flaw and passed all 21 queries while several were
plainly wrong; it now checks the returned *title*, and 19 of 19 pass. The other two were the
radiators, dropped rather than fudged: no phrase finds them, and `radiator` returns a picture
titled *Radiation Tomatoes*. A part with no curated query simply shows no photograph.

**One photograph was not enough, and ranking alone could not fix it.** Title search returns page
after page of the Johnson Space Center crew collection — *Wilson in Node 1 Unity*, *Krikalev in
Zvezda*, *Hire in the Cupola* — so the single result on offer was often an astronaut rather than
the module. The signal that separates them turned out to be **where the subject is named**: a
photograph *of* Destiny is titled *Destiny Laboratory*, one taken inside it is *Polansky in Destiny
laboratory module*. Ranking on the subject's position, plus the words *view* and *exterior* and
against the crew-activity verbs, puts the overview shot first wherever one exists.

Wherever one exists is the limit. For Destiny, the Cupola, Columbus, Quest and Kibo the catalogue
has a clean overview and the ranking finds it; for Unity, Harmony, Zarya and Zvezda **every**
result is a crew snapshot, because that is all NASA has filed under those titles. No ranking
conjures a photograph that is not there, so the panel offers five and an arrow either side of the
image to step through them. Measured after the change, 7 of 19 parts still lead with a crew shot,
and the arrows are the answer for those seven.

**A module's name is not unique to the station.** *Tranquility* returned a panorama of Apollo 11 at
**Tranquility Base** — a fine photograph of the Moon, filed under a word this application means as
a Node 3, and *Unity*, *Harmony* and *Destiny* are ordinary English with the same trap waiting in
them. Results are now kept only when the text names the station or a mission that visited it, or
the frame's own identifier is an ISS or Shuttle number. Measured across all nineteen queries that
drops 7 of 343: the Apollo panorama and six Kennedy ground-processing shots.

Getting the second signal right mattered more than it looks. A genuine STS-88 photograph of Zarya
was being thrown out, because the catalogue writes its identifier `STS088-359-005` — no hyphen,
which the first pattern required.

**Where a phrase runs dry, a second one is tried.** Four parts could offer only one or two
photographs, and in three of those cases the catalogue was not thin — the phrase was. `Tranquility
module` matches three photographs while `Node 3` matches two dozen of the same room; `AMS-02`
matches exactly one because the catalogue mostly writes it `AMS-2`; `BEAM` finds thirteen where
`Bigelow Expandable` finds one. The extra phrases are consulted only when the first comes up short,
so the common case is still a single request, and each is ranked against its own words — scoring a
`Node 3` result against "Tranquility module" would mark it down for never naming a subject it was
never asked about.

Checking that also turned up how much was simply missing: photographs now exist for **47 parts
rather than 19**, including every truss segment, the three mating adapters, Prichal, the Bishop
airlock, the Kibo logistics module, the mobile transporter and the rotary joints. Thirteen of the
47 still offer fewer than five, and that is now a fact about the catalogue rather than about the
query. Two candidates were rejected on inspection: `Multipurpose Laboratory Module` looks like
Nauka and returns **Node 2**, which was also Italian-built, and `S5 Truss` returns nothing at all —
it is a short spacer segment and nobody photographed it alone.

Two things caught along the way, both by reading output rather than by a passing test. A bare
`Leonardo` query returned a technician named Leonardo Barreda inspecting an SLS core stage — the
word check passed happily, since a person can share a module's name — so the query is now `Leonardo
module`. And the first ranking rewarded short titles without asking where the subject sat, which
let *Thomas floats through Zvezda* win on four words; a test now pins that case. The five images
cost about 230 kB together, because `rel: "preview"` is the 40–60 kB size rather than the megabyte
original.

Each photograph carries **two** links, because they answer different questions: the title opens
NASA's catalogue entry — caption, keywords, every size they hold — and a second link fetches the
frame itself at full resolution. Its dimensions are printed beside it so nobody opens a megabyte
blind: the Cupola's canonical frame is 3072 × 2098 and 948 kB, against 640 × 437 for the preview
shown in the panel.

### Where the readings sit

The layout was rebuilt around one measurement. The map is locked to 2:1, so given a full-height
column it drew 1270 × 636 inside 1318 × 1196 and left **560 px — 47 % of the largest area on
screen — showing nothing**. Meanwhile the telemetry sat last in a 400 px column whose content ran
to 2762 px, behind Orbit (544) + Passes (56) + Next orbit (596): **1196 px of other panels, which
was exactly one screenful**. The readings this application exists to show began precisely where
the viewport ended.

So the wide column now carries the scene above and the telemetry below, and the side column keeps
the orbital context. Measured again afterwards, at the same viewport: no dead space around the map
at all, **22 of 30 channels visible without scrolling anything**, and a side column whose content
(1196 px) finally fits its height (1196 px) — it no longer scrolls.

Three things had to be fixed to get there, and each was a measurement rather than a preference.

**`max-height` does not shrink a `width: 100%` SVG.** It clamps the box while
`preserveAspectRatio` letterboxes the drawing inside it, so the map's border floated a hundred
pixels clear of the map on both sides. The drawing is 2:1, so capping the *width* at `88vh` caps
the height at `44vh` with no second constraint to fight.

**A chart drawn in a 340-unit viewBox and stretched to 620 px is magnified, not widened** — labels,
ticks and stroke weights grow with it, which is why the first attempt looked coarse. `LineChart`
now takes a `width` for its own coordinate system; the strip asks for 640 and renders at 1:1.

**Symbol identifiers cost a column.** Printed beside all 163 labels, the `USLAB000053`-style codes
were a strip of monospace noise about as wide as a value. They are the key for looking a parameter
up in NASA's catalogue, so they moved to the label's tooltip rather than being deleted.

**A grid gives every item in a row the height of the tallest.** The sixteen-channel photovoltaic
block therefore sat alone on its own row with half the strip blank beside it, and the panel was
1004 px tall. Flowing the sections into CSS columns instead — `break-inside: avoid` so a heading is
never orphaned — brought it to 805. That change had its own trap: two 300 px columns need
`2 × 300 + 24` of gutter, 17 px more than the space beside the chart, so the browser fell back to
one column and the strip silently doubled in height again. The gutter counts.

Keeping whole sections together turned out to be the wrong instinct too. The sixteen-channel
photovoltaic block is 543 px on its own, so it set the height of every column beside it and three
quarters of the strip stood empty. Letting the content flow and protecting only what must not be
split — a heading from the rows it introduces, a row from itself — packs the readings into the
height of the longest *column* rather than the longest section: 287 px instead of 543.

The chart went the same way. Beside the readings it was 640 px wide and 226 tall, and those 640 px
were a whole column of values that could not be shown; a single trace needs time on the horizontal,
not depth. It now runs the full width at 96 units tall. Measured at the same viewport, every
subsystem but two shows **all** of its channels with nothing scrolled — Power 30 of 30,
Communications 19 of 19, Thermal 16 of 16, Command & data 17 of 17, Life support 29 of 32, and
Attitude & orbit, the largest at 49 channels, 31 of 49.

**A chart is only crisp if it is drawn at the size it is displayed.** Twice during this rework the
type came out magnified or shrunk, because an SVG with a viewBox is *scaled* into whatever box CSS
gives it. `useElementWidth` measures the box and the chart draws that many units, so the scale is 1
by construction in any column. It measures twice over, and the first is not redundant:
`ResizeObserver` delivers through the rendering lifecycle, so a page opened in a **background tab**
gets no callback at all until it is first shown. Reading `clientWidth` in a layout effect owes
nothing to painting and is right immediately — verified in a real browser whose tab was, as it
happens, hidden: viewBox `0 0 1271 96` into a box of exactly 1271 × 96.

### The Sun was lighting the station and nobody could see it

The 3D scene already lit itself from the real Sun: `sunDirectionLvlh` puts the solar vector in the
station's own frame, and the light fades as `shadow` rises. That direction is worth trusting —
a test checks it against the **beta angle**, computed by an entirely separate route, and the two
agree to a millionth. A wrong sign there would produce a scene that looks completely plausible
while lighting the station from the wrong side, which is not the kind of error anyone catches by
looking.

What was missing was that nothing on screen said *where* the Sun was. There is now a disc at the
light's position, drawn unlit — a light source lit by other lights would be a contradiction — and
hidden during eclipse, because that is what eclipse means. It is bigger than life: at that distance
the real Sun subtends half a degree, about 2.6 units, which reads as a speck.

**And the station now shades itself.** One shadow-casting light, every mesh casting and receiving,
and the truss and radiators lay real bands across the modules. The shadow camera's frustum is sized
to the station — 109 m of truss, 74 m of modules — because an orthographic shadow camera spends its
whole resolution on the volume it is given, and a generous one blurs every edge it exists to draw.
Measured after the change: still 60 fps at 1318 × 660.

Checking it needed a trick worth recording. The station was in Earth's shadow when the work landed,
so the scene was correctly dim and the Sun correctly invisible — which proves the eclipse path and
nothing else. Forcing full sunlight temporarily, screenshotting, and reverting showed the other
half: hard terminators across the modules, the port wings dark while the starboard ones blaze, and
the disc itself at the frame's edge.

### Do the solar arrays actually point at the Sun?

The strongest check available on the 3D scene, because three independent things have to agree for
it to pass: the SARJ and BGA angles come from NASA's telemetry, the solar vector from SGP4 and a
solar ephemeris, and the joint axes from the GLB's own node hierarchy. Measured in the live scene
by taking each wing's panel normal — the thinnest axis of its geometry in the joint's frame, local
X on all eight, with the 1391:448 extents matching the real 34 × 12 m — and comparing it to the
light's direction.

**The wings came out 50.2° off the Sun.** All eight, within half a degree of each other, which is
the signature of something systematic rather than noise.

Ruling things out, in order. It is not a mirrored frame: sweeping all eight sign combinations of
the solar vector, the best any of them managed was 44.7°, where a sign error would have produced a
near-zero candidate. It is not the joint axes: sweeping the starboard SARJ and its BGA over the
full 360° × 360° found a reachable pointing of **1.6°**, so the rig can do it. And it is not the
model's orientation, which three physical facts confirm — the Cupola sits at y = −8 (nadir is −Y),
Zvezda at z = +25 and Harmony at z = −12 (aft is +Z).

The answer was in the header: **`Signal interrupted — last data 13 min 17 s ago`**. The Sun moves
through the station's frame at 360° / 92.96 min = 3.87° a minute. 13.3 × 3.87 = **51.5°** against
50.2° measured. Sampling every thirty seconds while the telemetry sat frozen, the correction needed
drifted at exactly that rate — 12° over three minutes against 11.5° predicted. Re-measured later at
a 15.65-minute outage: **62.5° measured, 60.6° predicted, agreeing to 1.9°**.

Nothing was wrong. The scene was drawing precisely what it had been told, thirteen minutes earlier.

### But it was not saying so

That is the finding worth keeping. Holding the last known angles through a loss of signal is right
— a station that snapped to a rest pose every few minutes would be worse — but the scene was silent
about it, while the header two hundred pixels away admitted the outage. The consequence is
specific and quantifiable, so the scene now states it: *"Joints frozen — no telemetry for 15 min
39 s. The solar arrays are drawn where they last reported; the Sun has moved about 61° since."*

The drift is computed from the outage, not quoted as a constant, and a test pins it at two
durations. It is the same principle the telemetry rows already follow — missing data is shown as
missing — applied to the one view that was still quietly implying otherwise.

### Making the scene look like a photograph

Three changes, in the order they mattered.

**The fill light was the problem.** Ambient 0.35 plus hemisphere 0.4 made every surface legible
from every angle — comfortable, and quite wrong. Orbital photographs are brutally contrasty: one
hard source and a black sky. Cutting the fill to a fifth was tried first and overshot: physically
closer, and it left the shadow side unreadable, which matters in a tool whose whole purpose is
inspecting the parts on that side. Halving it is the compromise, and it is stated in the code
rather than pretended away.

**The Sun could not be found.** A disc half a degree wide inside a 42° field is in frame perhaps
one time in six, so a halo — nested additive shells, an order of magnitude wider — now makes it
unmistakable when it is there.

**And a marker says where it is when it is not.** Pinned to the edge of the view in the Sun's
direction, sliding along that edge as the camera turns, gone the moment the Sun comes into frame
and the halo can speak for itself. Hidden during eclipse, because then there is genuinely nothing
to point at.

The placement is a pure function with its own tests, because its interesting cases cannot be
reached by hand: the Sun crosses the field in a fraction of a drag. One of those cases is a real
trap — `project` folds a point *behind* the camera back into the frame with both signs inverted,
so an unguarded reading marks a Sun at your back as dead ahead, and off to the wrong side as well.

### Rotating the view was selecting parts

Noticed three times in a row while turning the scene to look for the Sun: a drag that begins on the
model still ends in a click, so releasing the button selected whatever was under the pointer.
`event.delta` is how far the pointer travelled between press and release; past four pixels the
gesture was a rotation, not a choice. Verified both ways — a 160 px drag now changes nothing, and a
click with no movement still selects.

### An Earth to be above

The scene had a station and a sky and nothing to be *over*, which left the model reading as an
object on a shelf rather than a thing in orbit.

It cannot be to scale. The Earth would be 6,371,000 units across with its centre 6,791,000 below,
in a scene whose far plane is 4,000, so something has to give — and the thing worth keeping is what
the eye reads: **how much sky the planet fills**. From 420 km the Earth's angular radius is
`asin(6371 / 6791)` = 69.7°, covering 139° of the sky and putting the horizon well below the station
rather than at its feet. A sphere of radius r at distance d subtends `asin(r / d)`, so matching the
angle means `d = r · (R + h) / R`. At r = 1800 the centre sits at 1919 and the far side at 3719,
inside the existing far plane — the depth buffer keeps the range it was tuned for and the station's
fine geometry does not begin to z-fight.

That one line of arithmetic is exactly the kind that goes wrong invisibly: a horizon at 60° and one
at 80° both look like a horizon. **The same two numbers also produce a plausible wrong answer** —
`acos(6371 / 6791)` = 20.3° is the footprint half-angle seen from Earth's centre, and I reached for
it first. A test now pins the angle at 69.7° and separately asserts the result is *not* the
footprint figure.

It is deliberately unmarked: no coastlines, no cloud. This is a horizon, not a globe — the map view
already answers *where*, and a low-resolution texture over a sphere this size would invite a
reading of geography it cannot support. What it adds is somewhere for the station to be, a
terminator on the ground that agrees with the one on the station because both come from the same
light, and a thin atmosphere shell rendered from the inside so the limb glows where a 40 km layer
is finally thick enough to see.

### The map said nothing to a screen reader

`<svg role="img">` makes the drawing a **leaf** in the accessibility tree. Every `<title>` inside
it — the station's position, the subsolar point, the observer's state, the times along the track —
was collapsed away and never announced, leaving one fixed sentence about a map that changes every
second.

The drawing cannot carry the data, so a live region beside it does: *"Station at 38.6 degrees
north, 28.8 degrees east, over Turkey, in sunlight."* Hemispheres are spelled out because a screen
reader reads `43.4° N` as "43.4 N", which is not a latitude. When a location has been set it adds
whether the station is above the horizon from there, using `withinFootprint` — the same test the
circle is drawn from.

Announced on a **timer, not on every change**: the position updates once a second, and a polite
region fed at that rate talks over itself and buries the rest of the page. Thirty seconds is about
two degrees of latitude. One exception, and it needed catching — the component mounts before the
orbital elements have loaded, so the opening sentence is "waiting for orbital elements", and the
timer alone would have left it there for a full cycle after the answer arrived.

Ten tests cover it, including both hemispheres and the wording, because this is the one part of the
map nobody sighted will ever check.

### The graticule was drawn but not named

Lines every 30° tell you the grid is regular and nothing else — you cannot read a longitude off
them. They now carry `60° N`, `120° W` and the rest, with a dark halo drawn under the text
(`paint-order: stroke`) so they stay legible over ocean, over land and under the night shading
alike, without a background plate. Verified by position rather than by eye: every label sits within
3 px of what `lonToX` and `latToY` say its parallel or meridian is.

### The 3D view could not be used without a mouse

Selecting a module meant clicking a mesh: `onClick` and `onPointerMove` on the model, and nothing
else. That excludes a keyboard outright, and it is barely usable on a tablet — hovering does not
exist there, and hitting a named strut with a fingertip is a test of aim rather than of intent.
Since tablets are a stated target, this was a functional gap on a supported device.

The inspector now carries a grouped `<select>` naming all **62 parts** across eight categories.
A select rather than a list because sixty-two entries would be taller than the panel holding them,
while a select is one control the platform already makes reachable, operable and announced. It
stays in place once something is selected, so moving from one part to the next does not mean going
back to the scene and aiming again, and it moves when the scene is clicked so the two never
disagree about what is on screen.

It pairs with the deep link: choosing Zvezda updates the panel, the photograph and the address bar,
without the canvas being involved at all.

### Sized for tablets and desktops, and not for phones

A decision, stated so it is not mistaken for an oversight: the target is tablet and desktop.
Phones are not supported, the stacked layout below 900 px is a fallback rather than a design, and
nothing here is tuned for them.

The layout was tuned on a desktop and it showed. Measured across the sizes that matter:

| Viewport | | readings visible, before → after |
|---|---|---|
| 1024 × 768 | iPad landscape | **0** → 14 of 30 |
| 768 × 1024 | iPad portrait | 10 → 26 |
| 1280 × 800 | laptop | — → 26 |
| 1366 × 1024 | iPad Pro | 10 → **30** |
| 1920 × 1080 | desktop | 13 → **30** |
| 1800 × 1300 | tall desktop | 22 → 28, and the map stays 1144 px wide |

The worst case was 1024 × 768 — the commonest tablet there is — where **nothing at all** was
readable without scrolling: the 1100 px breakpoint dropped the second column, the map took 490 px
of the 768 available, and the strip began 641 px down. Exactly the fault the whole layout had been
rebuilt to fix, still present one size below where it was tested.

Three changes, each measured rather than guessed.

**The side column gives ground before the data does** — `clamp(300px, 26vw, 400px)` instead of a
fixed 400 — and two columns now survive down to 900 px rather than 1100. At 1024 that alone bought
back the second column and removed the page scroll.

**Short viewports get a compact arrangement**, keyed on height because height is what is scarce: a
1280 × 800 laptop has the tablet's problem and none of its narrowness. The map caps at 68vh of
width, the subsystem tagline and console list step aside, and — the change that did most of the
work — **the chart moves below the readings**. One trace does not outrank thirty values for the top
of a panel; it is still there, one short scroll down. Chrome ahead of the first reading fell from
320 px to 76.

**The threshold is 1100 px of height, not the 850 first tried.** At 850 a 1920 × 1080 desktop kept
the roomy arrangement and showed 13 readings while a 1280 × 800 laptop showed 26 — the larger
screen showing less, which is plainly the wrong way round. 1080p is the common case and belongs on
the compact side of the line. Only a genuinely tall screen has height to spare, and there the roomy
arrangement earns it: at 1800 × 1300 the map is 1144 px wide *and* 28 of 30 readings are up.

The touch affordance added just before this work turns out to belong to it: a tablet is a
`hover: none` device, and without that rule the gallery arrows would have been invisible on exactly
the machines this section is about.

### What is shown first, and what waits to be asked for

**Passes overhead is folded shut.** Three days of passes is a long list and a tall panel, and it
answers a question most visitors did not arrive with — they came to see where the station is.
Folded, it costs one line; and while it is shut, the 72 hours of propagation behind it are not
computed at all.

**Sources are one small link in the header.** Nobody opens a tracking page wanting a bibliography,
but an application that asserts a cabin pressure owes an answer to "says who?", and leaving that
answer in a repository nobody reads is not an answer. The dialog names all eight sources, what each
is used for, and how it is reached. It is a native `<dialog>`, so the focus trap, Escape-to-close
and the inert backdrop cost no code.

### Two views

- **Map** — an equirectangular world map: the ground track — 45 minutes behind and **90 ahead**,
  which at 92.96 minutes per revolution is very nearly the whole of the next orbit, marked every
  quarter hour and labelled every half — the circle from inside which the station is above the
  horizon, your own position within it if you have set one, and the night side as a computed polygon with the
  subsolar point marked. Drawn as SVG rather than through the 3D renderer — a map has no camera to
  place, no depth to sort and no lighting to model, and vector strokes stay crisp at any size. A
  panel names the country or stretch of ocean directly beneath, and lists the coming passes over a
  chosen location.
- **Station** — NASA's official model at metre scale. Hovering a part names it on the spot;
  clicking it opens its description and the parameters published about it. The twelve joints
  (2 SARJ, 8 BGA, 2 TRRJ) are driven by telemetry; with no data they hold their original position.

**A layer of NASA GIBS night lights came and went too.** City lights clipped to the terminator
looked good in a screenshot and earned little on a map this size: at 16 km per pixel a city is a
smudge, it cost 225 kB of tiles, and it told nobody anything the shading did not. What it left
behind is in the git history, along with the three quiet failure modes it took to get right.

**A 3D globe came first and was removed.** It carried the same information, plus the station model
at its real attitude, and it was genuinely nice to look at — but half the orbit was always hidden
behind the near side, and reading a position off a sphere is slower than reading it off a map. The
flat map answers the question better, so the globe went rather than staying as a second way to do
the same thing. That took roughly 200 kB of three.js off the map view, and left `Globe`,
`GroundTrack`, `StationOnGlobe`, the scene frame and the camera store with nothing to do.

## The 3D model

The model on display is NASA's **(D) IGOAL** model (`github.com/nasa/NASA-3D-Resources`, free of
copyright), and it is current: deployed IROSA arrays, Bishop airlock, Bartolomeo platform,
Canadarm2.

It is not usable as published — 91.4 MB — but for an unexpected reason: **63.8 MB of duplicated
textures**, every image stored both as WebP and as a PNG fallback. `npm run build:model` removes
them (4 MB remain), caps texture resolution, welds and simplifies the geometry, then recompresses
with Draco: **14.9 MB**, without losing a single one of the 580 named nodes.

That structure is what makes the model valuable. Its joints carry mission control designations and
map one-to-one onto the subscribed symbols:

| Model node | Symbol | Joint |
|---|---|---|
| `PORT_ALPHA_ROT` / `STBD_ALPHA_ROT` | `S0000004` / `S0000003` | alpha joints (SARJ) |
| `PORT_BETA_ROT_2A`…`_4B` | `P4000007`, `P4000008`, `P6000008`, `P6000007` | 4 port BGAs |
| `STBD_BETA_ROT_1A`…`_3B` | `S4000007`, `S4000008`, `S6000008`, `S6000007` | 4 starboard BGAs |
| `PORT_TRRJ_GAMMA_ROT` / `STBD_TRRJ_GAMMA_ROT` | `S0000002` / `S0000001` | gamma joints (radiators) |

### Parts follow NASA's assembly list

The breakdown matches NASA's own assembly-element nomenclature and the 2023 blowout diagram: the
model's 41 top-level elements are claimed **by exact node name**, one per element. Every truss
segment (S0 through S6, P1 through P6, Z1), every stowage platform (ESP-1/2/3, ELC-1/2/3/4), every
mating adapter (PMA-1/2/3) and every robotic element (Canadarm2, Dextre, Mobile Transporter) is its
own part — 62 in total, against 36 before.

That exactness matters. Matching name *prefixes* instead, as an earlier version did, lets one
element absorb its neighbours: a module's handrails and antennas would attach to whichever ancestor
happened to match first. `npm run verify:model` now checks four failure modes — a joint whose node
is missing, a top-level element the mapping never claims, a geometry node no rule reaches, and a
material shared between unrelated parts.

### Kibo could be seen through, and the model said so

The source file marks **19 of its 49 materials `alphaMode: BLEND` with a base colour alpha of
exactly 1** — the signature of a Blender export left on its default blend mode. three.js honours
that by setting `transparent: true`, which pulls those meshes out of ordinary depth sorting into
the transparent pass, where they are ordered by object centre. Nested geometry then draws in the
wrong order and the module appears see-through. This comes from NASA's file, not from the
reduction pipeline: the source declares it too.

It cannot be corrected blindly, because some of those textures do use their alpha channel.
`npm run fix:alpha` decodes each base colour texture and decides — but *counting* graded pixels
turns out to be the wrong test, and it took three attempts to find the right one:

1. **Share of graded pixels.** Fails: WebP's lossy encoding scatters values like 253 across flat
   opaque areas, so every texture looks slightly translucent.
2. **Position** — is a graded pixel adjacent to a fully transparent one? Better: that separates
   antialiasing along an atlas island from an interior region. Still fails, because the same
   compression noise sits in interiors too, and this criterion *regressed* four materials from
   MASK back to BLEND.
3. **Position, depth and clustering.** A pixel counts as deliberately translucent only if it
   touches no transparent neighbour, sits below alpha 200, and belongs to a connected run of at
   least 100 such pixels. Noise is scattered; a surface meant to be seen through is contiguous.

That last test separates cases a histogram cannot:

| Material | deep pixels | largest run | Verdict |
|---|---|---|---|
| Node.Cupola | 54,971 | **9,705** | BLEND — those are its windows |
| Truss | 1,413 | **394** | BLEND — genuinely translucent regions |
| IROSA | 3,221 | **16** | MASK — scattered singletons, pure noise |
| JEM_PM | 0 | 0 | OPAQUE — nothing transparent at all |

Kibo was the clearest case and the reported one: `JEM_PM` has **no transparent pixel whatsoever**,
99.7 % of it fully opaque, the rest compression artefacts. The truss and IROSA look alike in a
histogram — a few thousand graded pixels each — and are opposite in nature.

Final state: **29 opaque, 7 masked, 6 blended**. The script is idempotent, runs at the end of
`build:model`, and `verify:model` fails if a rebuild drops the correction.

### The highlight bled across the whole station, and the mapping was innocent

Hovering Zvezda lit up most of the ISS, which looks exactly like the prefix bug above. It was not.
The file carries **42 materials for 506 meshes**, and `MLI.Generic` alone is used by **47 of the
62 parts**. Highlighting works by tinting a material, and `Object3D.clone()` shares materials
rather than copying them — so tinting one module tinted every module drawn with the same material.

The first three checks all passed at 100 % throughout, because nothing was wrong with the mapping.
`IssGltf` now gives each mesh its own material copy (textures stay shared, so this costs 506 small
objects and no image memory, and the draw-call count is unchanged since the meshes were already
separate), and the fourth check fails the build if that clone is ever removed.

It also caught a mislabelling worth knowing about: `Payload_CMG1` and `Payload_CMG2` are *spare*
control moment gyroscopes stowed on the ELC platforms, not the four operational ones — those sit
inside the Z1 truss and are not modelled separately.

The NASA model is the only model. An earlier version kept a schematic station built in code as a
stand-in during loading, but a placeholder is hard to tell from the real thing at a glance, and it
was a second copy of the joint and selection logic to keep in step — the two had already drifted
apart once. The view now reports the load honestly, with progress and a distinct message for the
decoding phase the loader cannot measure, and says so plainly if the file fails.

The Draco decoder is served by the application (`public/draco/`) rather than by a CDN, so the
station stays displayable without depending on a third party.

## Technical notes

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

## Verification

### Unit tests

`npm test` — **89 tests, no network, no browser.** They deliberately do not chase coverage: each
one holds a rule the application must not break, or pins down something that took real effort to
establish and would regress silently.

| File | What it protects |
|---|---|
| `telemetry/units.test.ts` | missing data never renders as a number; enumerated states decode; onboard time reads as `Day 209 · 20:16:15` rather than `18126959000 ms` |
| `telemetry/health.test.ts` | the stream's `TimeStamp` is hours-since-new-year, hour 24 being 1 January; a zero timestamp means *never measured*, not *very old*; the year rolls over correctly |
| `scene/nasa/nodeMapping.test.ts` | elements are claimed by exact name — `Zvezda_SM_Something` must not resolve, which is the bug that made one module swallow half the station; joints turn about Z and X, never Y |
| `orbit/orbit.test.ts` | frame conventions; invariants true of any orbit (inclination, period, vis-viva-consistent speed); a pass is never called visible in daylight |
| `telemetry/subsystems.test.ts` | every subscribed symbol exists in the catalogue and every part reference resolves; the dead power channels warn instead of presenting a reading |

Writing them caught nothing in the application — but four of my own assumptions about its API were
wrong (`groundTrack` takes an interval, `PassPoint` exposes `date` not `time`, `Observer` uses
`altitudeM`, ground track points carry no segment flag), which is its own argument for having them.

### Against the outside world

Everything below was checked against something outside the application itself.

**Orbital engine**, against `api.wheretheiss.at`: **0.79 km** apart on ground position, 30 m on
altitude, period 92.96 min. And against the station's own telemetry: the computed beta angle read
−11.89° while `USLAB000040` published **−11.88°**.

**Passes**, against Heavens-Above for the same coordinates: identical maximum elevations (56°, 54°,
11°, 76°), identical rise and set bearings, identical daylight classification. Only the timezone
differed.

**Units and enumerations**, once the stream returned on 28/07/2026. The corrections marked
`inferred` were confirmed by the live values: partial pressures really are in mmHg (ppO₂ 168,
ppN₂ 580, ppCO₂ 2.65 — and their sum matches the cabin pressure), tank quantities in per cent,
temperatures in Celsius. Enumerations decode correctly (`AUTOTRACK`, `STANDBY`, `HEATUP`,
`PROCESS`). The CMG wheels read 6600–6601 rpm, their documented nominal speed.

Live data also **found two mistakes**: cabin and airlock pressure were labelled psi on the strength
of the catalogue, but 749 psi is absurd — they are mmHg. Both are corrected and marked `measured`.

**All 163 channels, one by one** (`npm run verify:telemetry`). Every subscribed symbol was
captured live and checked three ways: against its documented operating range, against the other
channels it must agree with, and — for the orbital state — against an entirely independent source.
163 of 163 published data, and every enumerated symbol decoded to a known state.

The internal checks are the ones that need no assumption of ours. The stream either contradicts
itself or it does not:

| Check | Result |
|---|---|
| CMG saturation vs momentum ÷ capacity | 14.36 % published, 14.36 % computed |
| LVLH quaternion norm | **1.000000** |
| CMG count vs the four individual flags | both 4, all wheels at 6,601 rpm |
| Onboard GMT vs this machine's UTC | **5.9 s** apart |

And against Celestrak, propagated with SGP4 — the station publishes its own J2000 state vector,
so the two can be compared directly. Magnitudes rather than components, because TEME and J2000
differ by the precession accumulated since 2000 (~0.37°, some 44 km at this altitude), and
comparing components without that rotation would measure our own omission:

- orbital radius: **0.07 km** apart (6790.5 vs 6790.6 km)
- orbital speed: **0.07 m/s** apart (7662.2 m/s)
- the published radius and speed satisfy the vis-viva equation to 3.3 m/s
- solar beta angle: published −12.38°, computed by the application −12.38°, **0.00° apart**

**Not every channel is alive, and the difference is measured rather than assumed.** In MERGE mode
the server sends an update only when a value changes, so a channel that arrives with the snapshot
and is never heard from again is publishing a constant. Over a five-minute capture, eight drive
currents and the oxygen production rate never moved — while `USLAB000060` and the potable water
tank, both frozen over a one-minute capture, resumed changing. Slow is not the same as frozen, and
the longer capture separates them.

Live data corrected three claims the application was making:

- The eight power channels are labelled **"drive voltage/current"** by the catalogue, not channel
  output. The voltages are alive (151–161 V, and they do not move together, so they are not one
  regulated bus). The currents are not: all eight read exactly zero, and stayed there through five
  minutes in which the SARJ turned 19° and the gimbals moved over a degree. The old label promised
  that "a negative current means the channel is delivering" — a reading never observed. **NASA's
  own Mimic guide marks this same readout "not working"**, which settles it: the channel is not
  published, and no amount of interpretation will recover it.
- **`NODE3000011`** (oxygen production) is frozen to the bit at −59.457 lb/day while the three
  water tanks beside it move, and 59 lb/day is roughly five times what an OGA can produce. Both
  sign and magnitude are wrong; it is presented as unusable.
- **Station mass** reads 472 t, not the "around 420 tonnes" the app claimed — the published figure
  includes docked vehicles and their propellant.

Several things the application already had right were confirmed rather than changed. The SARJ
turned **19.08° in 300 s = 3.82°/min**, against the 3.87°/min a 92.96-minute orbit implies and the
"about 4° per minute" the app tells readers. The Mimic deck confirms the wing naming (**even is
port, odd is starboard** — so 1A/3A/1B/3B are starboard and 2A/4A/2B/4B are port, as mapped),
that **Loop A is the starboard radiator and Loop B the port one**, and the 6,600 rpm the gyroscopes
run at (6,601 observed). The Lightstreamer demo renders onboard time as `209/19:39:25`, the same
day-and-time decomposition adopted here.

**The drive voltages sometimes split, and eclipse is not the whole reason.** Three captures so far:
in Earth's shadow all eight sat between 151.1 and 151.3 V (**0.26 V apart**); in sunlight one
capture separated them into groups about 9 V apart, some near 160 V and some near 151.6 V, while
another had all eight at 151.5–151.9 V. So being in sunlight permits the split without causing it,
and eclipse has been seen only in the converged state. The tidy explanation — batteries make every
channel read alike, arrays make them differ — fits what has been seen but is not established;
whatever selects the high group is still unidentified.

That also forced a correction to the checks themselves. An earlier version tested the currents
against the lighting state and reported "zero array current is consistent with eclipse" — a
passing check that confirmed nothing, since the currents read zero in sunlight too. A check that
finds agreement between a real measurement and a constant is worse than no check at all, and it
was removed.

### What the globe taught before it was removed

The 3D globe is gone, replaced by the flat map. Three things learned building it are worth keeping,
because two of them still govern how the map is drawn.

**A terminator has to be drawn, not lit.** The globe was shaded by a directional light in the real
direction of the Sun, and this file used to claim the terminator "appears on its own". It did not:
coastlines drawn with `lineBasicMaterial` ignore lights entirely and stayed exactly as bright at
midnight as at noon. Worse, the one lit surface carried a specular highlight that tracked the Sun,
landing precisely where the night side should have been darkest. A dark veil over the night
hemisphere fixed the coastlines but only ever *subtracted*, and subtracting from an already-dark
globe is close to invisible. What worked — and what the map now does — is giving every surface a
day colour and a night colour and mixing between them: daylight has to be genuinely brighter, not
merely less dim.

**Filling continents is a trap.** Fanning each polygon from its centroid is only valid for a convex
shape; it filled Tierra del Fuego and left the rest of South America hollow. Proper ear-clipping
fixed the shape but not the coverage, because rings crossing the antimeridian were being skipped —
and the largest ring in the dataset is 14 % of the sphere by itself. Unwrapping longitude instead
of discarding those rings is what finally worked, and it is the same trick the map uses for
Eurasia. One test caught all three failures: total area against the 29 % of the Earth that is land.
Every structural check passed throughout.

**The station was drawn far too small, and then invisible for another reason.** At one unit per
Earth radius it measures 0.0000086, so it had to be exaggerated some six thousand times. Even then
it rendered pure black: its materials are `MeshStandardMaterial` and the view had no lights left,
every other surface having been made unlit on purpose.

### The marker points where the station is pointing

The station is drawn on the map as its own silhouette rather than as a dot, and turned to the
ground track's heading — which costs nothing and is not decoration. In LVLH attitude the
pressurised modules lie along the velocity vector and the truss sits square across it, so a
silhouette aligned to the track has every part where it really is. `trackHeading` measures that
angle **on the map**, not as a great-circle bearing: plate carrée stretches longitude towards the
poles, and a true bearing would leave the marker visibly askew of the line it is following.

Two details had to be right. Longitudes are wrapped before the angle is taken, or a crossing of
the antimeridian reads as a 358° step west and spins the marker through half a turn. And the
latitude difference is subtracted rather than negated, because `-(0)` is **−0** in JavaScript and
`Math.atan2(-0, -1)` is −π where `Math.atan2(0, -1)` is +π — the same rotation, but due west would
come back as −180°.

The shape itself is a compromise made once and then measured: the station carries eight solar
wings in pairs at each end of the truss, and at marker size the gap within a pair falls below one
device pixel, so the wings close up and the whole thing reads as a letter H. Each pair is drawn as
one panel. The proportions are the real ones — 109 m across the truss against 73 m tip to tip
along the arrays — except the module stack, which is about three times too thick because 4 m
against 109 m would disappear.

### Linking to a part, and the blind spot that made it worth building

`?part=cupola` opens the station view with the Cupola already selected, and selecting a part writes
the same parameter back — `replaceState`, not `pushState`, so clicking through a dozen modules does
not bury the page a dozen entries deep in the back button. A module becomes something you can send
to someone, which is what an educational page most often needs and most often cannot do.

It also closed a hole in what could be checked. `PartPhoto` only appears once a part has been
selected in the 3D scene, so every check of it stopped at the network — the right photographs, the
URLs resolving, the images decoding. Whether the component then *drew* them was verified by eye and
nothing else. The inspector lives in the side column and never needed WebGL; only the click that
fills it did. A URL does the same job.

**And then properly, in the test suite.** `jsdom` and `@testing-library/react` were added and
`PartPhoto` got the project's first rendering tests: both links present with `target` and
`noopener`, the dimensions printed and correctly omitted where the catalogue publishes none, the
arrows hidden for a single photograph, the gallery wrapping at both ends, and the index resetting
when the part changes. jsdom is opted into per file with a `@vitest-environment` docblock — the
other 219 tests are pure functions over data and have no business paying for a DOM.

Those tests were then checked against two deliberate mutations, because a green test that cannot go
red proves nothing: clamping the gallery instead of wrapping, and leaving the index alone when the
part changes. Each was caught by exactly the test written for it, and by no other.

### Two marks that make the map answer a question

**The track carries its times.** Ninety minutes of curve says where and never when, and every
sample already knows its own date, so the marks cost a search rather than a second propagation.
Dots every quarter hour, labels every half — six labels along a line that doubles back on itself
collide with each other and with the track, while the unlabelled dots keep the rhythm.

They read `+30 min`, not `11:20`. A clock time printed on a map is ambiguous unless the map also
says which zone it belongs to, and this map is drawn in longitude, where every reader has a
different answer. Elapsed minutes need no zone and no footnote. The exact moment is still on the
tooltip, where there is room to name the clock it comes from.

That the marks land correctly is worth checking rather than eyeballing, because a plausible
position is easy to draw and hard to doubt. Fifteen minutes ahead looked far too distant until it
was measured: 15 min is 58° of arc, and the argument-of-latitude calculation puts the station at
17.5° N against 17.3° drawn. The +45 mark sits at **51.6° S** — the orbital inclination exactly,
which is the southern apex and could not be anywhere else.

**Your own position is on the map**, if you have set one for passes. The two features were built
apart and belonged together: the circle drawn round the station is the live answer to the question
the passes panel answers for the next three days. The mark turns green and gains a halo while the
station is above the horizon from there.

That state comes from `withinFootprint`, which is deliberately the *same* test the circle is drawn
from rather than a second calculation that happens to agree — a mark claiming a pass while sitting
outside the circle beside it would discredit both. A test walks the footprint polygon's own
vertices and requires each to be inside a circle a kilometre larger and outside one a kilometre
smaller.

### The orbit's day/night line is not the terminator

The night polygon on the map is the ground's own sunrise and sunset. The station's is elsewhere:
at 420 km it sees the Sun before the ground below it does and keeps seeing it after local sunset,
so it flies lit over country that is already dark.

Measured against live elements at beta −15.4°: **35.5 minutes of eclipse** per 93-minute orbit —
the figure quoted for the ISS — with **exactly two crossings**, and the station still sunlit
**114.5°** away from the subsolar point, which is 24.5° past the terminator. The geometry alone
accounts for 20.3° of that (`acos(6371/6791)`); the rest is penumbra.

Two crossings and no more is the invariant worth holding: a shadow test that flickered around its
threshold would break the track into a dashed line, and a unit test pins it.

**On the map this reads as a contradiction until it is drawn.** The night polygon is the ground's;
the eclipse belongs to the station. So the panel can report the station sunlit while the marker
sits in the dark part of the map — which looks like a bug and is the very thing that makes the
station visible from the ground at dusk. The ground track is now dashed where the station itself
is eclipsed, and the dashes visibly start *later* than the terminator: over one orbit, 10 samples
in 96 have the station lit above dark ground.

The asymmetry is one-way, and a test enforces it: the station is **never** eclipsed while the Sun
is above the horizon underneath, since anything blocking its view of the Sun blocks the ground's
too. A failure there would be a real bug; the reverse case is physics.

### Choosing what to plot, by measurement rather than taste

The chart in each subsystem panel has a picker, and it offers **33 channels out of 163**. Which 33
was not a matter of judgement: `npm run verify:plottable` opens a real session, watches every
subscribed channel for five minutes, and reports what each one did.

Three things disqualify a channel. **Enumerated states** — a mode, an on/off flag — plot as a step
function and say nothing the value display does not. **Clocks** change constantly and mean nothing
as a curve. And **twenty-seven numeric channels produced a single value** in five minutes; some are
genuinely steady, but most are stalled sensors re-sending an old reading. The eight array drive
currents sit at exactly zero and publish no timestamp at all; the partial pressures, cabin pressure
and total mass are weeks behind. Every one of them is what someone would reach for first, which is
why the unit tests name them explicitly as things never to offer.

**The first version of that check was wrong, and the check itself is what showed it.** It counted
distinct values over the window and failed anything with fewer than two — which flagged Destiny's
air coolant temperature, a sensor that is perfectly alive and merely slow. Counting variation
confuses a slow sensor with a dead one. The test is now **staleness**: each channel carries the
station's own timestamp for when it last measured, and a channel fails if that is more than six
hours old. Under that rule all 33 pass, at 0.0 to 0.2 h — and the stalled ones are weeks away from
the line, nowhere near ambiguous.

That change also made the check survive a quiet stream. Two runs an hour apart saw 9,230 updates
and 1,654: under the old rule half the list would have "failed" the second time for no reason but a
slow window. Staleness passed both.

Some channels that move are still left out, deliberately and on the record: the four LVLH
quaternion components, which mean nothing apart and an attitude together; the six J2000 state
vector components, which the orbit panel already shows as a position and a speed; the eight BGA
angles, which would be most of the power menu while telling the same Sun-tracking story the SARJ
tells in one trace; and the commanded SARJ angle, which tracks the measured one closely enough to
draw as a single line. Command & data handling ends up offering nothing at all, and says so in
place of a chart — every channel there is a state, a clock or a counter.

### A value can arrive fresh and be a month old

The 17.7 mmHg ppO₂ disagreement between Destiny and Tranquility was not a difference between
modules. The two readings were taken **eight days apart**.

The stream carries a `TimeStamp` per symbol, in hours elapsed since the start of the year — the
same origin as `TIME_000001`, checked against it (5036.2715 h ↔ day 209.8446). Reading it changes
the picture completely, because a channel can re-send the same measurement every few seconds
forever:

| | |
|---|---|
| 8 array drive currents | **no timestamp at all** — never measured, which is what "not working" looks like from here |
| 13 continuous sensors | stalled: both modules' partial pressures (25 and 33 days), station mass (28 days), O₂ production rate (28 days), starboard TRRJ (3 days) |
| 43 enumerated symbols | unchanged for over a day — this is stability, not staleness |
| 91 continuous sensors | under a day old, oldest 4.1 h |

That distinction matters in both directions. An old timestamp on an enumerated symbol dates its
last *transition*: a computer reading "Not-Off Ok" for 28 days is healthy. On a continuous
measurement it dates the last number the sensor produced at all.

Two consequences. The interface was timing age from local arrival, so it announced "3 min" for
month-old data — the one thing this application is not allowed to do; it now reads the station's
own timestamp, and marks a stalled continuous sensor distinctly from a steady state. And the
"partial pressures sum to cabin pressure" check quoted above was comparing readings 25 days apart
against a live total. It stays in the output as an observation, but it is no longer claimed as
verification: it was never four contemporaneous sensors agreeing.

The 472 t station mass, flagged earlier as merely outside a nominal range, is a 28-day-old
reading — which is the better explanation for it.

**Joint axes and signs.** Both were settled by measurement, after being got wrong by assumption.

The axis first: all twelve joints were assumed to turn about their local Y, which put the solar
wings in impossible attitudes. `npm run inspect:joints` composes the node transforms and reports
which axis each joint's children extend along — a beta joint holds a wing 1392 units long on Z, an
alpha joint holds the outboard truss offset by 785 on Z, a thermal joint spreads its three radiator
panels along X. So beta and alpha turn about **Z**, gamma about **X**.

Then the signs. The telemetry invites a correction that turns out to be wrong: the alpha joints
publish 137° (port) alongside 222° (starboard), and each module's two wings publish values summing
to 360°, which looks like two conventions needing reconciliation. Measuring the angle between the
eight wing planes settles it — applying the published angles unchanged leaves them **5.1°** apart,
while "correcting" the mirrored ones drives that to **68.2°**. The mirroring is already baked into
the rest orientations of the model, whose paired wings face opposite ways.

Still unverified: the absolute zero of each joint. Parallelism fixes the relative convention, not
the origin.

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
- Nothing tests the React components or the 3D scene. Both need a DOM and a WebGL context, and
  what they would catch is mostly caught already: the scene by `verify:model`, the panels by the
  editorial tests.
