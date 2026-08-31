# Architecture

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

### Space weather, removed

DONKI drove a panel here until 31 August 2026, when it went along with the passes panel: the
application is about what the station is doing now, and a list of solar flares was answering a
question nobody had asked it. Two findings from building it are worth keeping, because both were
the data correcting a reading of it rather than a bug.

**A distribution that looks like a bug and is not.** 67 of 76 flares in the window came back at
M-class or above, where C-class normally dominates by count. Checked against the raw feed, the
month really was 65 M, 2 X and 9 C: the Sun is near the maximum of cycle 25.

**Which exposed a second, in the panel's own wording.** It summarised the month as "67 flares at
M+", and near solar maximum that number describes the cycle rather than the month. Sorting by flux
rather than by date was the fix — the five most recent were five M1s while both X-class events sat
sixty rows down — and it is also why `flareFlux` existed at all: each class letter is a decade, so
a string comparison puts C9.9 above M1.0.

The endpoint was Goddard's CCMC rather than `api.nasa.gov`, which mirrors the same data but wants
an API key — and a key in a static page is a key published to the world. Worth remembering if
anything here ever needs NASA data again.

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

**And then the flow lost the headings.** Balancing the columns is the browser's strength and
grouping is not: a section that ran past the foot of one column resumed at the top of the next with
no heading over it, so a reader scanning that column met `Array 3A drive voltage` with nothing to
say it was a photovoltaic control unit. It got worse as the screen got bigger — 6 of 7 columns
headless at 2560, 3 of 5 at 1920, 2 of 3 at 1366 — which is the wrong way round for a fault.

A printed table answers this by repeating the heading over the continuation, and repeating it means
knowing where the break falls, which means placing it. `telemetryColumns` cuts the columns instead
of `columns: 260px`, reproducing the browser's own count — `floor((width + gap) / (width + gap))`,
pinned in a test against the four counts it actually drew — and repeating any heading a break
interrupts, marked with a leading ellipsis. It refuses to leave fewer than two readings under a
heading, since two lines of furniture for one number is not a group. The cost is one line on the
tallest column, 224 px against 270 at 1920; every column now opens with a heading, at every width
and on all six subsystems.

**The value moved to its label.** The row was `1fr auto`, which stretches the label cell and pins
the value to the far edge of the column — 199 px of nothing between `BGA 1A` and the angle it
names, and a *different* distance on every line: measured across the strip, 19 px to 199. The
section now owns the two tracks and each row borrows them through `subgrid`, so the label column is
as wide as the longest label in that block and every value in the block starts at the same x. The
worst gap fell to 63 px and the median to 10. Where `subgrid` is not supported the row keeps its
old `1fr auto` and reads as it always did, which is the right way for this to degrade.

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
to the station — 94 m of truss, 73 m of arrays — because an orthographic shadow camera spends its
whole resolution on the volume it is given, and a generous one blurs every edge it exists to draw.
Measured after the change: still 60 fps at 1318 × 660.

Checking it needed a trick worth recording. The station was in Earth's shadow when the work landed,
so the scene was correctly dim and the Sun correctly invisible — which proves the eclipse path and
nothing else. Forcing full sunlight temporarily, screenshotting, and reverting showed the other
half: hard terminators across the modules, the port wings dark while the starboard ones blaze, and
the disc itself at the frame's edge.

### Do the solar arrays actually point at the Sun?

Yes. Run five times across a quarter of an orbit, through the boundary out of eclipse:

| pass | beta | state | off-Sun, eight wings |
|---|---|---|---|
| 1 | −23.09° | eclipse | 1.6° – 3.5° |
| 2 | −23.12° | eclipse | 0.8° – 4.1° |
| 3 | −23.15° | sunlit | 0.3° – 4.5° |
| 4 | −23.17° | sunlit | 0.6° – 4.4° |
| 5 | −23.18° | sunlit | 1.4° – 3.9° |

Forty measurements between **0.3° and 4.5°**, no failures, no geometry mismatches. The residual is
the station's own tracking lag: `S0000005` publishes the angle the port SARJ was commanded to, and
it sits a couple of tenths of a degree from where the joint actually is.

Getting there took two corrections to the model and the retraction of three earlier answers. It is
the strongest check available on the scene, because three independent things have to agree for it
to pass: the SARJ and BGA angles come from NASA's telemetry, the solar vector from SGP4 and a solar
ephemeris, and the joint geometry from the GLB's own node hierarchy. An error in one cannot be
absorbed by another.

`npm run verify:arrays` runs it, in two parts. The first re-derives from the model the constants
the joint table declares and checks the rest orientations are real rotations — no Sun, no clock, no
stream, so a typo in the table or a change to the GLB fails there. The second applies live
telemetry and asks where each blanket ends up. It exits non-zero, so it can be run without being
read.

### Retracted: the earlier measurements were taken from frozen frames

Three times this section confidently reported a number — 50.2°, then 45.0°, then 47°–88° — and each
time the measurement was made inside the running scene while **the scene was not running**.
`useFrame` stops whenever the browser window is not the one in front, and the automation that drove
those measurements left it behind another window. The joints kept whatever angles they were last
given, and — the part that made the readings look plausible rather than absurd — the Sun kept
three.js's default `(0, 1, 0)`. Every angle was measured against straight up.

The check that catches it costs one line — `document.hidden`, which reads `true` in exactly this
situation and is why `requestAnimationFrame` never fires. Read a quaternion, wait, read it again
for confirmation: nothing moves. Both checks now run before any measurement, and the measurement
itself moved out of the browser altogether, into `npm run verify:arrays`, which rebuilds the same
geometry from the glTF file and the same solar vector from the same propagator, with nothing in it
that can silently stop.

What survives from those attempts: the panel normal really is local X, confirmed later on the
blanket mesh alone at 67 × 449 × 1385 units, and the SARJ really does turn at orbital rate,
confirmed from raw telemetry with no model in the path. What does not survive: all three angle
figures, the fitted 45° constant, and most of a table of seven "ruled out" hypotheses, which ruled
out nothing because the input was a constant.

### The real defect: a quarter turn between the model and the joint's zero

The station publishes a beta gimbal angle measured from the position where the blanket lies in the
plane perpendicular to the truss. That convention is what makes |BGA| equal |beta| when the arrays
track the Sun, and the telemetry bears it out — with beta at −22.97°, all eight wings published
19.0° to 19.3° from their own reference. The model was built with the blanket's normal lying
*along* the truss instead: a quarter turn away.

The correction is not fitted to the picture. Sweeping each joint for the rotation that puts its
blanket perpendicular to the truss — geometry only, no Sun anywhere in it — returns **90.00°,
residual 0.00°, on all eight wings**. That is now `zero` in the joint bindings, and the Sun serves
as the check instead of as the input.

Three things were confirmed along the way, each by a route that could have contradicted it:

| | how | result |
|---|---|---|
| The scene frame is right | the port alpha joint's rotation axis, in scene coordinates | `[-1, 0, 0]` — the truss axis, where LVLH puts it |
| The blanket's normal is local X | extents of the blanket mesh alone, in its own joint frame | 67 × 449 × 1385 units = 1.6 m × 11 m × 34 m |
| The two SARJs publish mirrored conventions | their sum, across many samples | 359.90° to 359.94°, never the 90° out-of-phase case NASA also documents |

### And the alpha joints run backwards

With the quarter turn applied, a single alpha offset brought six wings to within about 4° of the
Sun — and the offset would not hold still. Fitted twice while the joint swung through 88.5°, it
moved 139.75°. A rigging constant cannot do that.

What it can do is absorb a **sign**. At any one instant, flipping the sign and shifting the zero to
match give the identical pose, so a fit is content with either and the wrong one drifts. Watching
it move separates them in one measurement: the published port angle *falls* at 3.79°/min while the
scene needs the joint to advance at the orbital rate, and across three samples spanning 46° of
travel the published change and the fitted correction summed to **23.80° against 23.79° of orbit**.
Both joints therefore turn opposite to the angle they publish, and with that fixed the zeros stop
moving:

| | fitted zero, sample by sample | spread |
|---|---|---|
| Port alpha | 170.0°, 171.5°, 172.1° over 46° of travel | 2.1° |
| Starboard alpha | 188.4°, 187.4° over 27° of travel | 1.0° |
| Starboard, with the sign left as it was | 39°, 344° | 55° |

That last row is the control: the same data, the same fit, one assumption changed.

With both corrections in, **six of the eight wings came down to 3.6°–7.5° off the Sun, with
0.3°–0.5° reachable** — the remaining gap being the station's own tracking lag rather than the
model's. The other two are the next section. `npm run verify:arrays` rebuilds the geometry from the
glTF file and the solar vector from the propagator and prints the table, outside the browser, where
nothing can quietly stop running.

### The S6 roll was the measuring tool, not the model

1B and 3B sat at 71.3° while the other six tracked, and none of the obvious explanations held: their
own beta gimbals only wanted ±5.4°, they share a working alpha joint with 1A and 3A, swapping their
two published angles made it worse, and their mounting measured identical to the rest. The story
written here was that `Truss_S6` carried 71° of roll. It does not.

Chasing where the masts actually pointed found them **89.1° from the others** — a quarter turn, not
71°, and a relative angle that no rotation above them could produce, because both S4 and S6 hang
off the same alpha joint. That left only the arithmetic. `Truss_S6` carries a uniform scale of
**63.33**, and the joints beneath it **0.016**, which is how the model keeps that module in its own
units. The verification script read each joint's resting orientation with
`Quaternion.setFromRotationMatrix`, which assumes an orthonormal upper 3×3 and says nothing when it
is not: on those two nodes it returned a non-unit quaternion, and every rotation composed with it
came out wrong.

The scene never had the problem — three.js's loader decomposes the transforms itself, and all
twelve joints read back a rest quaternion of exactly 1.0. The bug was in the tool built to check
the model, which is the more embarrassing place for it and the easier place to miss it: a wrong
answer from a measuring instrument looks like a fact about the thing measured.

Reading it with `decompose` instead, all eight wings came in together for the first time — 2.1° to
6.4° off the Sun on that sample, and 0.3° to 4.5° over the five-pass run above. The station's
arrays track, and the twin now shows them doing it.

### Making the Earth look like the Earth

Two changes, and the second only became possible because of a decision the first one forced.

**The limb is shaded from the ray, not from the shell.** It was a sphere of flat blue at 1.025× the
radius, evenly bright the whole way round, which reads as a rim light on a ball. Three things
separate that from air in a photograph, and all three fall out of one quantity — how far the ray
travels through atmosphere. So the shader takes the line from the camera through each pixel, finds
how close it passes to the planet's centre, and the rest is closed form: the band is brightest
exactly at the ground and collapses upward, it reddens where the Sun is low for the same reason a
sunset does, and it stops dead at the terminator because unlit air is not a light source.

The band's height stopped being a guess: 100 km scaled with the planet, 1.6 % of the radius, where
the old shell used 2.5 % while its own comment claimed 40 km. And the number the shader normalises
against is derived — a grazing ray crosses **640 units of a band only 28 units deep**, twenty-two
times further, which is the whole reason a limb glows.

**Then city lights on the night side.** The Earth here is deliberately unmarked and the reason still
holds, so it is worth saying why this is not a reversal. Lights are point sources, so softness reads
as bloom rather than blur — which is what a long exposure from the cupola looks like anyway. The
texture is NASA's Black Marble at 0.1° per pixel, about 11 km, roughly 200 pixels across the ground
the station can see at once: enough to show that a coastline is inhabited, not enough to find a
city, and nothing invites the attempt.

What the bare sphere never needed was an **orientation**. Any rotation of an unmarked ball looks the
same. Paint anything on it and the question turns sharp, because lights in the wrong place are a
claim about geography and a false one.

The first construction pinned it with three facts — the ground below the station is at the reported
latitude and longitude, up there is +Y here, and north there runs along the **ground track's
heading**. Two of those are right. The third is not, and the error is worth keeping: a ground-track
bearing is measured over a surface that is itself turning, while the frame the station flies in is
inertial. The gap between them is the Earth's rotation, 0.46 km/s at the equator against the
station's 7.66, and it showed up as a steady **2.5°** — a hundred kilometres at the edge of what the
station can see. What replaced it composes the two bases directly: the scene's axes in ECI, the
Earth's axes in ECI turned by sidereal time, and the rotation between two orthonormal bases is their
table of dot products. No heading, no second propagation, and no gap. It measures **0.0000°** now.

That fixed the smaller of the two faults. The frame itself put +Z through 90° **east**, which reads
more naturally and quietly makes it **left-handed**, because with the pole on +Y an eastward
longitude turns about −Y. The matrix was a reflection, determinant −1, and the entire map was
mirrored east for west.

Eighteen tests passed while that was true. Orthonormal triads, the sub-satellite point under the
station, north along the ground track — every one of them asked the matrix a question and then
graded the answer with the same matrix. **So did the check this section used to end on**, the one
described as closing the loop through every stage at once: read back the framebuffer, ray-cast each
pixel to a latitude and longitude, compare against the texture there. It reported Perth to a third
of a degree. It was circular — the ray-cast and the texture lookup both went through the orientation
being tested, so a mirrored world agrees with a mirrored reading of it. A loop that contains the
error twice will always agree with itself, however many stages it spans.

Two kinds of check are immune, and both are now in the suite. One is algebraic and needs no scene:
a **determinant**. The other asks something that has never heard of this frame — the **Sun** —
where it is, and compares: place the subsolar point on the globe with this rotation, and it must
land where the solar vector independently says the Sun is.

| | how | result |
|---|---|---|
| It is a rotation, not a reflection | determinant, 16 geometries round one orbit | 1 to 1e-9; fails outright on the old frame |
| It agrees with an outside witness | subsolar point through the matrix against `sunDirectionLvlh` | **0.0000°**, where the ground-track version read 2.5° |
| It puts the right ground below the station | invert it and read latitude and longitude back | within the 0.19° geodetic-to-geocentric flattening |
| The pole is where the latitude says | angle from zenith to the pole must be 90° − latitude | to 0.2°, and it pins the one roll the sub-satellite point leaves free |

### The sea reads as sea

The planet was `roughness: 0.95` — near-matte, which is paint. The one thing every daylight
photograph over an ocean has and this scene did not is the **glint**: the smeared bright patch where
the Sun reflects off the water, and the thing that tells the eye the blue is liquid. Unmarked also
settled what the sphere was made of: there were no continents on it, so it was all sea. The next
section puts continents on it, and the figure below stops applying uniformly — it becomes what the
roughness map carries over water, with land near-matte.

The number is derived, because the interesting property of a glint is its *size*, and size comes
from the slope of the waves. Cox and Munk measured that from aerial photographs in 1954 and the fit
is still standard — slope variance `0.003 + 0.00512·U` for a wind of U m/s. Two conversions follow,
and both are worth writing down because neither is guessable:

| | |
|---|---|
| wind 7 m/s, an ordinary day | slope variance 0.0388 |
| RMS slope | √0.0388 = 0.197 rad, about 11° |
| GGX lobe width | √2 × 0.197 = 0.279 |
| three.js takes *perceptual* roughness | √0.279 = **0.528** |

Stopping after either conversion gives 0.197 or 0.279 — both plausible numbers to hand a material,
both wrong, and both still producing *a* bright patch, which is why a test asserts it is neither.
Wind moves it slowly rather than not at all: 2 m/s gives 0.403 and a gale at 20 m/s gives 0.678, a
dead calm 0.278 and a storm at 25 m/s 0.715. Nothing in that range is either a mirror or a matte
surface, which is the useful part — the glint does not depend on getting the weather right.

Verified by measuring rather than by looking. Across the same frame, sampling a line over the sea:

| | luminance across the water | contrast |
|---|---|---|
| matte, 0.95 | 74 · 74 · 74 · 74 · 74 · 75 · 75 · 76 · 76 · 77 | 3 |
| water, 0.528 | 67 · 70 · 73 · 77 · 82 · 86 · 88 · **89** · 88 · 86 | 22 |

It rises and falls, so it is a lobe rather than a gradient. And with everything but the planet
hidden, the brightest pixel landed 0.055 in NDC from the predicted specular peak — displaced
*away* from the nadir, which is where Fresnel puts it and where a prediction using only `N·H`
would not.

Those luminances are historical: they were read while the station's fill lights still reached the
planet, and *Half the planet had geography* ends with taking them away. Re-measured across the
whole frame through the Sun's azimuth, the lobe is unchanged in shape and far stronger in
contrast — **9 at the dark end, 117 at the peak, and falling again after it**, where the fills used
to hold the dark water up at 67.

### Half the planet had geography and half was paint

This reverses a decision, so it is worth naming which one. The sphere was deliberately unmarked, on
the argument that a texture at this scale invites reading a geography it cannot support and that the
map view already answers *where*. That argument was sound while the sphere was bare **on both
sides**. It stopped being sound the moment city lights went on the night side: half the planet then
carried real geography and half was flat blue, and the seam between them at the terminator was the
least defensible thing in the scene.

So the day side gets **Blue Marble**, chosen for the same property that makes Black Marble work at
night — **no lighting is baked into it**. The scene has its own Sun, from the same vector that lights
the station, and a texture carrying someone else's would fight it. That is also the whole answer to
why live weather imagery is the wrong tool here and these two are the right one: a satellite mosaic
arrives already lit, already shadowed, and already an hour old.

Three files, built by `npm run build:earth` rather than downloaded by hand, because a texture nobody
can regenerate is a texture nobody can check:

| | source | on disk |
|---|---|---|
| day | Blue Marble Next Generation, 5400 × 2700 | 1.2–1.4 MB, one per month |
| roughness | derived from the day image | 108–145 kB, one per month |
| clouds | BMNG cloud composite, 2048 × 1024 | 369 kB |

(One month each at first, which turned out to be a mistake worth its own section — see *Why it
looked like the Moon*.)

The **roughness map is derived, not downloaded**, because the glint from the previous section is now
wrong everywhere there is land — 0.528 is a figure for water, and painting it over the Sahara makes
the desert shine like a lake. There is no roughness product to fetch, but the colour image already
knows where the water is: sea is blue and dark, and nothing else on Earth is both. `waterFraction`
is the product of a blueness ramp and a darkness ramp, so snow is rejected by brightness and desert
by hue, and it grades rather than thresholds so coastlines do not alias into a stencil. It comes out
at **66.8 %** water against the true 71 %, and the missing 4 % is sea ice, which is correctly not
behaving like open water. Sea reads 0.528, land 0.92.

The first thresholds were tighter and gave 59.3 %, which is the kind of number that looks close
enough to accept. It is not: 12 % of the planet is a continent's worth of misclassified surface.
The script self-verifies against twelve named places — Sahara, Amazon, Greenland, mid-Pacific — and
prints the coverage, so tightening a ramp cannot quietly cost a sea.

**The clouds are a cloud field, not today's weather**, and the app never claims otherwise. Blue
Marble's cloud layer is a month of observations averaged into something that looks like a sky. Since
nothing else in this app invents data, saying so plainly matters more than usual.

Verified three ways, none of which shares a path with the others:

| | how | result |
|---|---|---|
| The mesh's own UVs land where they should | ray-cast the surface and read the `uv` **three.js** computes, against satellite.js for the sub-satellite point and the ephemeris for the subsolar point | nadir within the 0.19° flattening, subsolar **0.004°** |
| Day map and night lights are registered | the shader's `M·up` against the mesh's UVs, 408 directions covering the globe | worst disagreement **0.019°**, about 2 km |
| A human can read the geography | fly the clock forward to a daylit pass and look | over Sonora at 31.7° N, 112.9° W: Pacific on the **left**, Baja and the Gulf of California below, Rockies centre — a mirrored world puts the Pacific on the right |

The last row is not decoration. It is the only check in the table that a mirrored, self-consistent
frame cannot pass, and the reflection described earlier survived everything that was not of that
kind. The night side gives the same test for free and sharper: over Brazil the lights stop dead
along a diagonal with black beyond it, which is the Atlantic coast drawn by where people are not.

### Why it looked like the Moon

Reported as a question rather than a bug — *is it the clouds giving that grey?* — and the answer was
no, twice over, which is why it is worth writing down. The clouds were the obvious suspect and
measuring them took a minute: remove the layer entirely and the frame moves from rgb(172,162,145)
to rgb(180,171,155). **Eight levels out of 255.** Whatever was wrong, that was not it.

**The basemap was December.** `world.topo.bathy.200412`, chosen without noticing that Blue Marble is
twelve composites and one of them is northern midwinter. In August. The station flew over the
Rockies and the ground below it was under snow:

| | December | August |
|---|---|---|
| land north of 39° N reading as snow | **65.7 %** | 12.8 % |
| Manitoba, 50.5° N | rgb(117,122,120) | rgb(26,38,11) |
| its saturation | **0.10** | **0.70** |

Seven times the saturation, same place, same planet. So all twelve months are built now and the
scene loads the one it is. The repository carries 17 MB of them and a visitor still downloads 1.4.
NASA's record numbers step by 25 for most of the year and then do not — 46 across April, 58 across
October — so they are written out rather than computed, because a formula would have fetched the
wrong month in silence.

**And the planet was wearing the station's lighting.** At the same point, the texture reads
rgb(117,122,120) and the renderer put it on screen at rgb(178,177,168): half again as bright, half
as saturated. The ambient and hemisphere fills exist to keep the station's shadow side legible,
which is a stated compromise for a 94-metre object being inspected — on a planet they are simply
wrong, because nothing fills a planet's shading but the planet. They are now on layer 0 only, so
they reach the station and stop at the sky's edge. Earthshine is out for a second reason as well:
it *is* the planet's light, so lighting the planet with it counts it twice.

Measured after, comparing every rendered pixel against the texture at the latitude and longitude it
came from — 2,304 of them, land and sea kept apart:

| | texture | rendered | |
|---|---|---|---|
| land | rgb(36,43,26) sat 0.542 | rgb(41,43,31) sat 0.363 | **×1.10** brightness, was ×1.52 |
| sea | rgb(23,52,78) sat 0.673 | rgb(64,75,88) sat 0.283 | ×1.48 — which is the glint, and belongs there |

**The clouds were still wrong, just not guilty.** The greyscale was wired as colour *and* opacity,
which is a category error: a cloud is white, and the image says how much of it there is. Used twice
the two multiplied, so a cloud stored at 0.30 came out as a 0.30-grey at 0.30 opacity — a dark film
rather than a cloud. White now, with the image supplying opacity alone.

That fix immediately produced the opposite problem — the planet went milky — and the diagnosis was
wrong. It looked like a **monthly mean**, spread smoothly over everything at 24.5 % opacity, and a
mean has no edges; so the values went through a 1.5 power curve to push the thin half towards
clear. Both the reasoning and the number were sound given the premise, and the premise was false.
See the next section.

### It was the small file, twice over

*"The resolution is really poor — it looks like the display hasn't finished loading. Is that what
Blue Marble is?"* Yes and no: it is Blue Marble, at the smallest of the sizes NASA publishes, and
the arithmetic says the complaint is exactly right. One screen pixel covers **0.83 to 1.36 km** of
ground in the default view. One texel of a 5400 × 2700 map covers **7.41**. The map was being
magnified six to nine times.

The ceiling is not the file size, it is texture memory:

| width | km per texel | acutance over the ground | download | GPU |
|---|---|---|---|---|
| 5400 | 7.41 | 2.075 | 1.2 MB | 74 MB |
| 8192 | 4.89 | 2.656 | 2.5 MB | 171 MB |
| **10800** | **3.71** | **3.028** | **4.1 MB** | **297 MB** |
| 21600 | 1.85 | — | 13.9 MB | 1.19 GB — past `maxTextureSize` |

Acutance is the mean absolute luminance step between neighbouring pixels, measured over the ground
only. It is blind to exposure, which matters here because the lighting had just changed underneath
it. 10800 is a **46 %** gain and the last size the GPU will hold comfortably.

**The first version of that table said the resolution made no difference at all**, and it was
wrong in a way worth recording: `Texture.clone()` copies the `source` object *by reference*, so
assigning `.image` on the clone mutated the original too, and every variant was rendering the same
picture. The measurement agreed with itself to three decimal places, which is what a broken
experiment looks like when it is broken cleanly.

**Then the clouds, which turned out to be the real limit.** At 2048 × 1024 they were 19.55 km per
texel — three times coarser than the ground they sit on — and NASA publishes no larger version of
`cloud_combined`. It publishes the source instead: two hemispheres of 21600 × 21600, 202 MB each.
Stitched and reduced to 5400, that is 7.41 km per texel, **2.6 times finer**.

Two things fell out of doing that. Which tile is which was settled by correlating every arrangement
against the published small map rather than by trusting the letters in the filenames — west then
east scores 0.50, and the five alternatives score between −0.12 and −0.05. And the join is not
clean: the step across it averages 20.8 grey levels where neighbouring pixels ordinarily differ by
8, because the halves come from different passes. That is NASA's discontinuity, not the script's, so
it is feathered over sixteen columns rather than pretended away, and both numbers are printed at
every build.

The other thing that fell out was a **correction**. At full size the field is plainly one day's
weather — cyclones, frontal bands, the ITCZ, cellular convection over the oceans — dated in its own
filename, 29 July 2001. It is not a monthly mean, and the section above says so because the small
file looked like one: ten-fold downsampling had smoothed a real sky into a statistic. The power
curve added to fix that milkiness was a fix for an artefact, so it is gone, and the field is drawn
as published at 20.7 % mean opacity.

Anisotropic filtering was off as well — 1, on hardware offering 16. It does nothing for the
foreground, which is magnified rather than minified, but most of the planet is seen edge-on, and
there the mip chain was picking a level sized to the compressed direction and smearing the other.

The whole planet now costs a visitor 4.1 MB of colour, 0.13 of roughness and 2.3 of cloud, against
a 14.9 MB model it was already fetching.

### Auditing the arithmetic instead of the functions

Asked for after a run of defects that all had one shape, and it is worth naming the shape rather
than the defects: **an assumption about the thing beside the thing being edited.** A month's URL
copied without noticing it was one of twelve. A cloud field described as a monthly mean without the
file ever being opened, when its own name carried the date. Two textures compared while a shared
`source` object meant both were the same image — and the null result published rather than
questioned, though a nil difference between two resolutions is impossible. A channel count assumed
on a readback, ten lines below a comment warning about that exact trap.

So `npm run verify:render` walks every calculation the two views are drawn from, **46 of them**, and
the rule for each is that the expected value comes from a route the code under test does not use.
The footprint radius is checked against a different triangle, the subsolar point against an
independent almanac, the beta angle against the eclipse fraction it predicts, the terminator by
putting its answer back into the spherical rule it was solved from. It is organised by chain rather
than by file, and it ends with the section that matters:

| the seam | what has to agree |
|---|---|
| footprint ↔ horizon | the central angle at the planet's centre and the angular radius at the station must add to **90°** — 20.37 + 69.74 |
| map ↔ scene | the Sun's elevation over the sub-satellite point, from the map's subsolar figures and from the scene's light vector: **0.157°** apart, which is the geodetic-to-geocentric difference |
| map ↔ globe | a point on the map's terminator, carried into the scene, sits where the scene's own lighting turns over: **0.00000°** |
| ground ↔ station | the station must stay lit after the ground below it goes dark, never the reverse |

It found two things on its first run. One was a real error of the kind this whole section is about:
`oceanGlint` claimed in its own comment that 2 m/s gives 0.44 and 20 m/s gives 0.66, where the
figures are **0.403 and 0.678** — and the test file beside it had the right number all along. The
other was in the audit itself, which reported a 1.2e-6° disagreement about the Sun that was the
arccosine's noise floor near zero rather than a disagreement; it uses `atan2` of the cross product
now, and reads 1.0e-14.

**And a false alarm worth keeping.** `verify:arrays` failed that evening with all eight wings 40°
off the Sun, then 63°, then 73°. Nothing in the code had changed. The signal was already in its own
table: `best reachable` — the residual no beta angle can remove, which belongs entirely to the
alpha joints — had gone from 1.1° to 61°. Read twice, 75 seconds apart, the joints had not moved by
a hundredth of a degree while the orbit carried on, and the stream was demonstrably alive. **The
arrays were parked**, as they are for an approach, an EVA or a manoeuvre. The check had a premise
nobody had written down — that the station is flying nominal and tracking — so it now tests that
premise before blaming the model, and says which it found.

### The camera could fall through the sky

Reported from a screenshot rather than found by testing: swing the view under the station and the
left of the frame went flat blue, with an orange smear where the terminator should have been. The
atmosphere is drawn back-face-first, so from *inside* the shell it stops being a limb and becomes a
wall.

This is the seam between the scene's two scales. The station is drawn a metre to the unit; the
planet is compressed until it merely subtends the right angle, which puts its surface **118.7 units
below the origin** to stand for 420 km, and the top of the air at **90.4**. The orbit controls
allowed the camera out to **400 units** with no polar limit at all — four times deeper than the
ground. Four hundred metres is a sensible step back from a 94-metre object and, in the planet's
units, more than a thousand kilometres.

A fixed `maxPolarAngle` could not express the fix. It would either forbid looking up at the
station's underside from close in — a view worth having, and perfectly safe there — or allow it
from far out, where it is not. So the limit was recomputed each frame from the current distance, by
the law of cosines, and said the sensible thing on its own:

| orbit radius | furthest under | clearance above the air |
|---|---|---|
| 15 | 178° — directly beneath | 72 |
| 40 | 178° — directly beneath | 47 |
| 105 (default) | 128° | 25 |
| 250 | 108° | 25 |
| 400 | 105° | 25 |

It ran at frame priority −2, ahead of the controls' own update at −1. Set afterwards and the limit
lands a frame late: drag inward and the freedom to swing under arrives one frame after it should,
drag outward and one frame is drawn from a place the limit was about to forbid.

The shader carries a guard as well — if the camera is ever inside the shell it stops drawing the
air rather than filling the screen. The controls should make that unreachable; a wall of blue is
too loud a failure to leave to *should*.

**And the angle limit was not enough**, which only came out of sweeping the rest of the extremes
rather than stopping at the reported one. Panning does not swing the camera around what it is
looking at — it carries both. Dragging the target down 400 units put the camera **1621 from the
planet's centre, 179 below the ground**, while the angle limit sat at 0° and reported success. So
the target has a floor of its own, set so that even a camera directly above it still clears the
air, and a reach limit as well: without one the station can be panned clean off the screen, leaving
a black frame and no obvious way back.

The same sweep turned up a third thing, smaller. The atmosphere is drawn back-face-first, so its
*far* side has to stay inside the frustum, and at full extension it overshot a 4,000-unit far plane
by 143. Rendering the same views with the plane pushed back changed the picture by 0.2 % — noise,
because a camera high enough to overshoot is looking down at the station with the limb well outside
a 42° field. It is fixed anyway: the plane is now derived from the reach it has to cover, since a
geometry that holds only while the field of view does not change is not a geometry worth keeping.

Swept afterwards over **780 positions** — pan from −5,000 to +3,000 and 600 sideways, distance 15
to 400, every 15° of polar angle: no camera inside the air, none inside the planet, nothing clipped.

**All of that has since been deleted.** Every one of the four defects was a symptom of the planet
being pinned to the station's origin, and the limits treated the symptom: they were correct, they
were tested, and they spent their existence forbidding a view worth having. The next section
removes the cause instead, at which point the camera cannot reach the air from anywhere and the
floor has nothing left to do. What survives is the pan reach, which was never about safety, and the
shader's own guard, because a wall of blue is too loud a failure to leave to *should*.

### The planet shrank when you stepped back

The same seam, seen from the other side, and the more visible of its two faces. Pull the camera out
to look at the whole station and the horizon closes from **69.7° to 50.9°** — four hundred metres
of real altitude moves it by **nine thousandths of a degree**. The planet deflated like a beach
ball whenever anyone zoomed out, which is the single loudest thing in the scene saying *model*
rather than *orbit*.

Two more of the same. The star field is a shell of radius 800, so 400 units of travel swings it
through 30° of sky, where stars do not move at all. The Sun's disc sits 600 units out, so backing
off carried it **41.8°** away from the direction of the light it was supposed to be casting — and
the off-screen marker pointed at the disc, so it pointed at nothing.

The fix that suggests itself — move the planet with the camera — cannot work, and it is worth
saying why, because the reason is not obvious and it is what dictates the design. Anything held at
a fixed apparent size sits **118.7 units from the camera** at its nearest, while the station is up
to 400. One depth buffer cannot have the same object both nearer than the station and further.

So the sky gets a **pass of its own**: same orientation, same field of view, and the camera's
offset converted to the planet's units before it is applied — 400 units becomes **0.113**. Draw the
sky, throw the depth buffer away, draw the station over it from its own camera.

That is not parallax suppressed, it is parallax reproduced. The far pass is the real geometry under
a uniform scale about the observer, and a uniform scale about the observer changes no ray's
direction — so it renders the image the real geometry would render, including the hundredth of a
degree the horizon really does move. Everything else falls out of it: the stars stop swinging, the
Sun's disc holds the direction of its own light, and the camera can go anywhere at all.

Three things it also bought, none of them the point:

| | before | after |
|---|---|---|
| far plane over the station | 4,400, shared with a planet | **700** — six times the depth resolution where the fine geometry is |
| depth resolution at the planet | 0.44 units, against city lights sitting 0.7 above the surface | **0.02** |
| the camera floor | 190 lines, four defects, one forbidden view | gone |

Verified three ways, because the plumbing is a runtime arrangement that no unit test can reach:

| | how | result |
|---|---|---|
| The geometry | 1,438,560 camera positions, horizon compared against the kilometres of the real Earth | worst disagreement **0.0000°**; nearest approach to the air 90.25 units where the old arrangement went 459.6 *inside* it |
| The pixels | flat-lit planet, wide field, silhouette measured off the framebuffer at four distances | **69.695°** at 20, 105, 250 and 400 units — the same edge pixels, 565 and 1434, in all four |
| The cost | each pass timed on its own | sky pass **0.23 ms** against the station's 174 in the same measurement |

The pixel row is the one that matters. The sweep tests the arithmetic; only the framebuffer tests
whether the renderer is actually using the second camera, and a single pass would have read 68.2°
at 20 units and 50.9° at 400.

### Seeing it, in a tab that will not draw

A hidden tab does not just stop `requestAnimationFrame`. React Three Fiber measures its container
before mounting the scene at all, and that measurement never arrives either — so the canvas sits at
its default 300 × 150 with nothing in it, and `useThree` never runs. Dispatching one `resize` event
unblocks the measurement; `advance` from `FrameHandle` then draws frames on demand, running the
same `useFrame` callbacks as the scheduler would. Confirmed by the renderer's own counters: 2,182
draw calls, 5.7 M triangles, ten of twelve joints moving.

With frames, the scene agrees with the script — **1.5° to 4.4° off the Sun across the eight
wings** — and the Sun's starboard component reads 0.392 against `sin(23.1°)` = 0.392 from the beta
angle, which is the check `sun.test.ts` makes, arrived at through the renderer this time.

The picture that settles it is a pair. Put the camera where the Sun is: all eight blankets show
their full rectangle. Move it 90° away: all eight go to thin slivers, while the radiators — which
track nothing — stay broadside. Arrays that were mispointed could not do both.

### What this section used to say

Kept short, because the detail is worth less than the pattern. Three successive versions reported
the arrays as 50.2°, then 45.0°, then 47°–88° off the Sun, each with a decomposition, a table of
ruled-out hypotheses, and a plausible story. All three were measured against a Sun that was not
where the scene had put it, because the scene had not drawn a frame.

Two of those versions concluded that the defect was real and should be recorded rather than
patched, on the grounds that fitting a correction until the arrays looked right would be assuming
the answer. That reasoning was sound and the restraint was right — the constants that eventually
went in were derived from the model's geometry and from watching a fit hold still across 46° of
travel, not from one good-looking frame. What was wrong was the input, and no amount of care
downstream fixes that.

The one durable lesson is the cheap check that would have caught it at any point: read a value,
wait, read it again. A measurement taken from a system that is not running looks exactly like a
measurement.

### Checked against NASA's own descriptions of the mechanism

The *Reference Guide to the International Space Station*, Utilization Edition (NP-2015-05-022-JSC,
September 2015) is an infographic document: it names the parts and their jobs but publishes no
angular ranges. It confirms the division of labour the app describes — *"Solar (Array) Alpha
Rotation Joint (SARJ) tracks the Sun throughout Earth orbit"*, *"Beta Gimbals are used for tracking
the seasonal changes of the Sun"*, *"Electronics Control Unit (ECU) controls pointing of solar
arrays"* — and settles some numbers, but not the ones the defect turns on. Two technical documents
do: Boeing's ISS EPS overview and the NTRS SARJ anomaly paper (NASA/CP-2010-216272).

| Claim in this project | What the documents say | Verdict |
|---|---|---|
| Two perpendicular joints aim the arrays | *"Two mutually perpendicular axes of rotation are used to point solar arrays towards the Sun"* | **confirmed** |
| The BGA can reach any angle | *"The BGA is capable of a full 360 degrees of rotation"*, power passing through a roll ring over the whole range | **confirmed** — the 0–360° spread in the telemetry is not out of range |
| The SARJ turns once per orbit, ~3.87 °/min | *"one full rotation per orbit … approximately every 90 minutes"*; *"360° continuous rotational capability"* | **confirmed**; measured 3.78 °/min over 13 min |
| A wing is about 34 m long | *"Each solar array wing is 110-foot long by 38-foot wide"* → 33.5 × 11.6 m, ratio 2.89 | **confirmed**; the model's plate measures 3.10 |
| Four 100 kg gyros at 6,600 rpm | *"Each CMG has 98-kilogram (220-pound) flywheel that spins at 6,600 revolutions per minute"* | **confirmed** |
| "Eight wings generate up to 120 kW" | 2015 guide: *"up to 80 kilowatts"*; Boeing: *"about 84 kW at assembly complete"*; NASA's current facts page: *"75 to 90 kilowatts"* | **contradicted — corrected to 75–90 kW** |
| 109 m of truss | Three NASA sources give 94–95 m | **contradicted — corrected to 94 m** |
| The arrays should be within a few degrees of the Sun | *"These rotary joints … ensure full sun-tracking capability"* | **confirmed** — and so the mispointing was ours, which is what sent the search back into the model |

Nothing in any of them gives the BGA's zero reference or sign convention, which is exactly what the
two defects turned on; both had to be measured out of the model instead. And the public catalogue
offers no BGA mode and no BGA commanded angle — only the SARJ has those — so "the arrays are
deliberately biased" cannot be tested from this stream at all.

One measurement from the reading does not fit what the documents describe. NASA has the BGA
compensating *seasonal* motion, and beta moves about 4° a day; over a 13-minute sample beta moved
0.05° while every BGA moved **1.2° to 1.7°**, twenty-five times more, with the sign mirrored
between paired wings. So the beta gimbals carry a small orbital-rate term on top of the seasonal
one. It is genuinely small: sampled at three different points in the orbit, |BGA| against |beta|
came out 19.1° against 23.0°, 22.0° against 23.1°, and 19.2° against 22.9° — a couple of degrees of
wobble around the equality that ideal two-axis pointing requires, not a departure from it. Whatever
drives it is below the resolution of anything published here.

Two things were also confirmed live, and they matter because they pin the defect on this project
rather than on the station: both SARJs report mode 5, `AUTOTRACK`; and the port SARJ sits **0.18°
from its own commanded angle** (`S0000005`), so the station's control loop says the arrays are
where they were told to go. Separately, the beta angle computed here from Celestrak elements came
out at −19.76° against the published −19.7578° — 0.01° apart — so the solar vector is not the
problem either.

### The scene was also not saying when it had stopped listening

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
in a scene whose far plane was 4,000, so something has to give — and the thing worth keeping is what
the eye reads: **how much sky the planet fills**. From 420 km the Earth's angular radius is
`asin(6371 / 6791)` = 69.7°, covering 139° of the sky and putting the horizon well below the station
rather than at its feet. A sphere of radius r at distance d subtends `asin(r / d)`, so matching the
angle means `d = r · (R + h) / R`. At r = 1800 the centre sits at 1919 and the far side at 3719,
inside the far plane as it then was, so the depth buffer kept the range it had been tuned for. It
has since been split in two — the planet is drawn in a pass of its own, with its own frustum — but
these are still the numbers that decide where the sphere sits.

That one line of arithmetic is exactly the kind that goes wrong invisibly: a horizon at 60° and one
at 80° both look like a horizon. **The same two numbers also produce a plausible wrong answer** —
`acos(6371 / 6791)` = 20.3° is the footprint half-angle seen from Earth's centre, and I reached for
it first. A test now pins the angle at 69.7° and separately asserts the result is *not* the
footprint figure.

It began deliberately unmarked — no coastlines, no cloud — on the argument that this is a horizon
rather than a globe, and the map view already answers *where*. That held until the night side got
city lights, at which point the argument had to be settled one way or the other; it is settled
above, under *Half the planet had geography and half was paint*. What the sphere added from the
start, and still adds, is somewhere for the station to be, a terminator on the ground that agrees
with the one on the station because both come from the same light, and a thin atmosphere shell
rendered from the inside so the limb glows where a 100 km layer is finally thick enough to see.

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

### The phone build was half a build

`deviceBudget` swaps the station for a 256-texture copy on a phone-sized touch screen, which took
the model from 739 MB of decoded texture to about 200. It said nothing about the planet, and the
planet is the larger half of the bill: the day map alone is 10800 x 5400, **297 MB** decoded with
mipmaps, and it was loaded at that size on every device. With the clouds and the night lights the
planet came to 444 MB — so a phone brought down to 200 MB of station was still asked for more than
twice that in ground underneath it.

`build:earth:mobile` halves the three images that are looked at rather than read: 297 + 74 + 33
becomes 74 + 19 + 8, which is **303 MB saved** — more than the entire station reduction saved. The
roughness map keeps its size on purpose. It decides where the Sun glints, so it is read as data,
and blurring it moves coastlines in the glint for 14 MB; the detail tile keeps its size for the
opposite reason, since being sharper than the map beneath it is the whole of its job.

Measured in the browser afterwards, with `?model=light`: **148 MB** of texture in the live scene
against 968 on the full path, and the three light copies fetched by name — the roughness map and
the detail tile still at full size, as intended.

Derived from `public/textures/` rather than from NASA's originals, for the same reason the mobile
model is derived from the desktop one: everything needed is already in the repository, and a build
that needs the network is a build that stops working. It costs 15 MB of repository for 14 files.

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

**Passes overhead was folded shut, and is now gone.** Three days of passes was a long list and a
tall panel answering a question most visitors did not arrive with — they came to see where the
station is. Folding it cost one line and saved 72 hours of propagation while shut, which was the
right trade for as long as it was there; on 31 August 2026 it was removed outright, and with it
the only place a visitor could enter their own position. The marker that showed that position on
the map went at the same time — the panel was its only writer, so leaving it would have meant a
store nobody could fill and a legend pointing at a panel that no longer existed.

**Sources are one small link in the header.** Nobody opens a tracking page wanting a bibliography,
but an application that asserts a cabin pressure owes an answer to "says who?", and leaving that
answer in a repository nobody reads is not an answer. The dialog names all eight sources, what each
is used for, and how it is reached. It is a native `<dialog>`, so the focus trap, Escape-to-close
and the inert backdrop cost no code.

### Two views

- **Map** — an equirectangular world map: the ground track — 45 minutes behind and **90 ahead**,
  which at 92.96 minutes per revolution is very nearly the whole of the next orbit, marked every
  quarter hour and labelled every half — the circle from inside which the station is above the
  horizon, and the night side as a computed polygon with the subsolar point marked. Drawn as SVG rather than through the 3D renderer — a map has no camera to
  place, no depth to sort and no lighting to model, and vector strokes stay crisp at any size. A
  panel names the country or stretch of ocean directly beneath.
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
