### Reading the telemetry

The catalogue names the symbols but does not say how to interpret them. These do:

| Document | What it settles |
|---|---|
| [ISS Mimic Telemetry Screens](https://docs.google.com/presentation/d/11LBGKdbBd1ZbKKpKJ8Y54hAPogtyMLfRmvKoN2bRaHQ/edit) | which readings are **not working**, wing naming, TRRJ modes, antenna geometry, station modes |
| [Lightstreamer ISS Live demo](https://demos.lightstreamer.com/ISSLive/) | the reference rendering, including the `day/HH:MM:SS` time format and per-symbol timestamps |
| issmimic.space [ch. 2](https://www.issmimic.space/chapter2), [ch. 4](https://www.issmimic.space/chapter4), [ch. 5](https://www.issmimic.space/chapter5) | the water loops, the RFG-to-antenna assignment, the airlock leak-check hold |
| [Reference Guide to the ISS, Utilization Edition](https://www.nasa.gov/wp-content/uploads/2017/09/np-2015-05-022-jsc-iss-guide-2015-update-111015-508c.pdf) (NP-2015-05-022-JSC, 2015) | what each subsystem is for, the CMG and solar-cell figures, station-level dimensions |
| [Boeing ISS Electric Power System overview](https://ia902801.us.archive.org/20/items/GandalfDDI-SpaceShuttleDocuments/Misc_Space_Non-Shuttle/ISS_EPS.pdf) | the only source found that gives the BGA's rotation range and its four command modes |
| [SARJ Anomaly Investigation](https://ntrs.nasa.gov/api/citations/20100021920/downloads/20100021920.pdf) (NASA/CP-2010-216272) | the SARJ's rotation rate and mechanical layout |
| [Development and Use of the SPACE Computer Code](https://ntrs.nasa.gov/api/citations/20180007791/downloads/20180007791.pdf) (NTRS 20180007791, 2018) | **when the wings stop following the Sun, and why the bus sits at two levels** — see below |
| [Power Generation in Support of the Beta Gimbal Anomaly Resolution](https://ntrs.nasa.gov/api/citations/20030014592/downloads/20030014592.pdf) (NASA/TM—2003-212012) | the solar β angle's definition, the XVV ZNADIR and XPOP attitudes, and the gimbal modes — parked, rate, back-drive |
| [Active Thermal Control System Overview](https://www.nasa.gov/wp-content/uploads/2021/02/473486main_iss_atcs_overview.pdf) | the two ammonia loops, their flow rates, and what the radiator beam is actually pointed at |
| [A Researcher's Guide to Space Environmental Effects](https://www.nasa.gov/wp-content/uploads/2020/10/researchers-guide-space-environment-effects_tagged.pdf) | the temperature range surfaces outside actually cycle through |
| [NASA: water recovery milestone](https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/) (June 2023) | how much of the water is recycled, now rather than at first flight |
| [Out-of-Band Diagnostics Architecture for the ISS](https://ntrs.nasa.gov/api/citations/20030001141/downloads/20030001141.pdf) | the three C&DH tiers and the hot / warm / cold redundancy of the top one |
| [OCHMO-TB-003, Habitable Atmosphere](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-003-habitable-atmosphere.pdf) | cabin pressure and the oxygen band, and why a spacewalk still needs a prebreathe |
| [OCHMO-TB-004, Carbon Dioxide](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf) | the CO₂ limit, which is far lower than the app was claiming |
| [NASA Spectrum Usage](https://www.nasa.gov/directorates/somd/space-communications-navigation-program/nasa-spectrum-usage/) | the frequencies NASA actually holds, rather than the textbook band edges |

The Mimic deck is the useful one, because it is candid about its own gaps. It labels the
electrical current readout "not working" and the total power usage "not working currently" —
which is what independently confirms the frozen channels found below.

**The SPACE code paper settles two things the application had measured and could not source.**

The first is the two levels the array drive voltage sits at, which five days of collection found
and could explain only by inference: *"The SSU shunts unneeded solar array strings to regulate the
primary bus voltage."* That is the mechanism, in NASA's words — the arrays are not throttled, their
surplus strings are switched out to hold the bus where it is asked to be.

The second decides what an off-Sun measurement can mean: *"At solar beta angles above 40°, the beta
gimbals are no longer Sun-pointing to prevent solar array-to-solar array shadowing"*, the manoeuvre
being *"off-pointing adjacent SAWs to reduce shadowing on the rear wing"*. The application already
told its readers about the 40° threshold; it now has somewhere to have got it from.

It matters more than a citation. Every off-Sun sample `verify:arrays` has taken sits **below** that
threshold — 31.9° to 33.2° in August, then 16.4° to 17.4°. In that range the station is documented
as pointing its wings at the Sun, so the 10° to 20° of off-pointing measured there cannot be
backtracking, and the residue is more likely the model's than the station's. The check now says so
itself rather than leaving the reader to notice.

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
