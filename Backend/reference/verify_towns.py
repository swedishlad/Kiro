#!/usr/bin/env python3
"""G-DATA-5: verify the 351-town table (ids, Census population, county, approximate ISO-NE zone).

Usage:  python3 reference/verify_towns.py data/snapshot/ma_towns_2024.csv   (or data/build/ma_towns.csv)
Exit 0 = pass, 1 = fail. Stdlib only. Built Oct 24 2026 by reference/build_towns.py from the LMEC GeoJSON
(sha256 prefix 196cc2d7419c) and Census sub-est2024_25.csv (sha256 prefix f3abbe8f48f6).
"""
import csv
import sys
from collections import Counter

EXPECTED = {"rows": 351, "pop2024": 7136171, "pop2020": 6994598, "crosswalked": 7, "counties": 14,
            "zone_pop2024": {"NEMA": 3286038, "SEMA": 2139738, "WCMA": 1710395},
            "zone_towns": {"NEMA": 92, "SEMA": 98, "WCMA": 161}}
ANCHORS = {"Boston": ("35", "025", "NEMA", 673458), "Aquinnah": ("104", "007", "SEMA", None)}


def report(label, got, want):
    ok = got == want
    print(f"{label:30s} {'ok' if ok else 'FAIL'}  got={got} want={want}")
    return ok


def check(path):
    rows = list(csv.DictReader(open(path, newline="")))
    ok = report("[towns] rows", len(rows), EXPECTED["rows"])
    ok &= report("[towns] ids 1..351 unique", sorted(int(r["town_id"]) for r in rows) == list(range(1, 352)), True)
    ok &= report("[towns] pop2024 sum", sum(int(r["pop2024"]) for r in rows), EXPECTED["pop2024"])
    ok &= report("[towns] pop2020 sum", sum(int(r["pop2020"]) for r in rows), EXPECTED["pop2020"])
    ok &= report("[towns] crosswalked GEOIDs", sum(r["geoid"] != r["census_geoid"] for r in rows), EXPECTED["crosswalked"])
    ok &= report("[towns] counties", len({r["county_fips"] for r in rows}), EXPECTED["counties"])
    ok &= report("[towns] county = GEOID digits 3-5", all(r["geoid"][2:5] == r["county_fips"] for r in rows), True)
    ok &= report("[towns] zone pop2024", {z: sum(int(r["pop2024"]) for r in rows if r["zone_approx"] == z)
                                         for z in EXPECTED["zone_pop2024"]}, EXPECTED["zone_pop2024"])
    ok &= report("[towns] towns per zone", dict(sorted(Counter(r["zone_approx"] for r in rows).items())),
                 EXPECTED["zone_towns"])
    by = {r["name"]: r for r in rows}
    for name, (tid, county, zone, p) in ANCHORS.items():
        r = by.get(name)
        got = (r["town_id"], r["county_fips"], r["zone_approx"], int(r["pop2024"]) if p else None) if r else None
        ok &= report(f"[towns] anchor {name}", got, (tid, county, zone, p))
    return ok


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    good = check(sys.argv[1])
    print("G-DATA-5:", "PASS" if good else "FAIL")
    sys.exit(0 if good else 1)
