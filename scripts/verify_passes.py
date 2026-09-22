"""Recompute every pass with Skyfield and compare with the page's finder.

Criteria (from the spec): same passes; rise, culmination and set within 10 s; maximum elevation
within 0.5 deg; same visible/invisible call. A call that differs on a pass sitting within 0.5 deg
of a threshold is reported as marginal, not as a failure: two correct implementations can
legitimately fall either side of a line they both straddle.
"""
import json
import sys
from datetime import datetime

from skyfield.api import EarthSatellite, Loader, wgs84

TOL_S = 10
TOL_DEG = 0.5
MIN_EL = 10
DARK_SUN = -6

data = json.load(open(sys.argv[1], encoding="utf-8"))
load = Loader(".cache/skyfield")
ts = load.timescale()
eph = load("de421.bsp")
sat = EarthSatellite(data["line1"], data["line2"], "ISS", ts)


def when(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


t0 = ts.from_datetime(when(data["from"]))
t1 = ts.from_datetime(when(data["to"]))


def reference_passes(site):
    place = wgs84.latlon(site["latitude"], site["longitude"])
    times, events = sat.find_events(place, t0, t1, altitude_degrees=0.0)
    passes, current = [], {}
    for t, e in zip(times, events):
        if e == 0:
            current = {"rise": t}
        elif e == 1 and "rise" in current:
            current["culmination"] = t
        elif e == 2 and "culmination" in current:
            current["set"] = t
            passes.append(current)
            current = {}
    observer = eph["earth"] + place
    for p in passes:
        alt, _, _ = (sat - place).at(p["culmination"]).altaz()
        p["max"] = alt.degrees
        seconds = (p["set"] - p["rise"]) * 86400
        grid = ts.linspace(p["rise"], p["set"], max(2, int(seconds / 5)))
        sat_alt = (sat - place).at(grid).altaz()[0].degrees
        sun_alt = observer.at(grid).observe(eph["sun"]).apparent().altaz()[0].degrees
        lit = sat.at(grid).is_sunlit(eph)
        ok = (sat_alt >= MIN_EL) & (sun_alt <= DARK_SUN) & lit
        p["visible"] = bool(ok.any())
        # Marginal means the verdict itself flips when both thresholds move by the tolerance — not
        # that the track comes near 10 deg somewhere, which every pass above 10 deg does twice, and
        # which made every disagreement "marginal" in the first version: the check could not fail.
        loose = (sat_alt >= MIN_EL - TOL_DEG) & (sun_alt <= DARK_SUN + TOL_DEG) & lit
        strict = (sat_alt >= MIN_EL + TOL_DEG) & (sun_alt <= DARK_SUN - TOL_DEG) & lit
        p["marginal"] = bool(loose.any()) != bool(strict.any())
    return passes


failures = marginal = checked = 0
for site in data["sites"]:
    ref = reference_passes(site)
    ours = site["passes"]
    if len(ref) != len(ours):
        print(f"FAIL {site['name']}: Skyfield {len(ref)} passes, page {len(ours)}")
        failures += 1
    for p in ours:
        rise = when(p["rise"])
        match = min(ref, key=lambda r: abs((r["rise"].utc_datetime() - rise).total_seconds()), default=None)
        if match is None or abs((match["rise"].utc_datetime() - rise).total_seconds()) > 60:
            print(f"FAIL {site['name']} {p['rise']}: no matching pass in Skyfield")
            failures += 1
            continue
        checked += 1
        for key in ("rise", "culmination", "set"):
            delta = abs((match[key].utc_datetime() - when(p[key])).total_seconds())
            if delta > TOL_S:
                print(f"FAIL {site['name']} {p['rise']}: {key} off by {delta:.1f} s")
                failures += 1
        if abs(match["max"] - p["maxElevation"]) > TOL_DEG:
            print(f"FAIL {site['name']} {p['rise']}: max elevation {p['maxElevation']:.2f} vs {match['max']:.2f}")
            failures += 1
        if match["visible"] != p["visible"]:
            if match["marginal"]:
                print(f"marginal {site['name']} {p['rise']}: visible {p['visible']} vs {match['visible']}")
                marginal += 1
            else:
                print(f"FAIL {site['name']} {p['rise']}: visible {p['visible']} vs {match['visible']}")
                failures += 1

print(f"\n{checked} passes checked over {len(data['sites'])} sites, {marginal} marginal, {failures} failure(s)")
sys.exit(1 if failures else 0)
