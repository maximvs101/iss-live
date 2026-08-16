# Verification

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

That last comparison was a spot check at one instant, which cannot tell agreement from coincidence.
Five days of collected readings turn it into a distribution — **186 comparisons across 15° of
excursion**, from −32.3° to −17.5°:

| | |
|---|---|
| mean difference | −0.001° |
| median | 0.002° |
| RMS | **0.039°** |
| worst single case | 0.53° |

The error also does not grow with distance from the orbital elements' epoch: readings extrapolated
five days backwards differ by −0.005°, those taken near the epoch by −0.000°. So what residual there
is belongs neither to the propagation nor to the epoch handling — which is worth knowing, because
those are the two places an error of this kind normally hides.

**Eclipse, against the station's own power bus.** The application computes when the station is in
Earth's shadow; the station reports what its arrays are doing. Nothing connects the two, so they can
be crossed. Of 141 collected readings taken in shadow, **every one** has the array voltages below
155 V, averaging 151.2 V across a range of 0.7 V. Of 298 taken in sunlight, only 53 % do, spread
from 151.4 to 160.6 V.

The asymmetry is what makes it a check rather than a coincidence: shadow forces the low state and
admits no exception, while sunlight merely permits the high one — a lit array whose batteries are
full is shunted, and the bus falls back to the same 151 V. A shadow model that were wrong in either
direction would show up as exceptions on the side that has none.

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
one panel. The proportions are the real ones — **94 m** across the truss against 73 m tip to tip
along the arrays — except the module stack, which is about three times too thick because 4 m
against 94 m would disappear. The truss figure was 109 m until NASA's own documents were checked
against each other, and the correction widened the wings by a sixth.

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
