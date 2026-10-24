#!/usr/bin/env python3
"""Build the 351-town table: boundary ids + Census population + county + approximate ISO-NE load zone.

Usage:
  python3 reference/build_towns.py data/raw/mass-municipalities.geojson data/raw/sub-est2024_25.csv data/build/ma_towns.csv
  python3 reference/build_towns.py --from-snapshot data/snapshot/ma_towns_2024.csv data/build/ma_towns.csv
Verify with reference/verify_towns.py (G-DATA-5).

Sources: LMEC boundaries (S6; GEOID = state 25 + county FIPS + county-subdivision code) and U.S. Census Bureau
subcounty population estimates, vintage 2024 (S18, https://www2.census.gov/programs-surveys/popest/datasets/
2020-2024/cities/totals/sub-est2024_25.csv, SUMLEV 061 = MA towns; no API key needed).
Seven towns changed Census codes when they became cities; CROSSWALK maps boundary GEOID -> Census GEOID.
ZONE is an APPROXIMATION by county (ISO-NE publishes no town list we could verify): Middlesex -> NEMA and
Norfolk -> SEMA were chosen because that split makes all-sector consumption per person most consistent across the
three zones (max/min 1.44, vs 1.70-3.08 for the other splits). Label anything built on it "modeled".
"""
import csv
import json
import os
import shutil
import sys

CROSSWALK = {"2500546575": "2500546598", "2500901260": "2500901185", "2500940710": "2500940675",
             "2501127100": "2501127060", "2501501325": "2501501370", "2501519370": "2501519365",
             "2501773440": "2501773405"}
COUNTY = {"001": "Barnstable", "003": "Berkshire", "005": "Bristol", "007": "Dukes", "009": "Essex",
          "011": "Franklin", "013": "Hampden", "015": "Hampshire", "017": "Middlesex", "019": "Nantucket",
          "021": "Norfolk", "023": "Plymouth", "025": "Suffolk", "027": "Worcester"}
ZONE = {"001": "SEMA", "005": "SEMA", "007": "SEMA", "019": "SEMA", "021": "SEMA", "023": "SEMA",
        "009": "NEMA", "017": "NEMA", "025": "NEMA",
        "003": "WCMA", "011": "WCMA", "013": "WCMA", "015": "WCMA", "027": "WCMA"}
COLS = ["town_id", "geoid", "census_geoid", "name", "county_fips", "county", "zone_approx", "pop2020", "pop2024"]


def main():
    args = sys.argv[1:]
    if len(args) == 3 and args[0] == "--from-snapshot":
        os.makedirs(os.path.dirname(args[2]) or ".", exist_ok=True)
        shutil.copyfile(args[1], args[2])
        print(f"copied snapshot -> {args[2]}")
        return
    if len(args) != 3:
        sys.exit(__doc__)
    geo_path, census_path, out = args
    towns = [f["properties"] for f in json.load(open(geo_path))["features"]]
    pop = {("25" + r["COUNTY"] + r["COUSUB"]): r for r in csv.DictReader(open(census_path, encoding="latin-1"))
           if r["SUMLEV"] == "061"}
    rows = []
    for t in towns:
        cg = CROSSWALK.get(t["GEOID"], t["GEOID"])
        if cg not in pop:
            sys.exit(f"no Census row for {t['census_name']} ({t['GEOID']})")
        c = t["GEOID"][2:5]
        rows.append([t["massgis_town_id"], t["GEOID"], cg, t["census_name"], c, COUNTY[c], ZONE[c],
                     int(pop[cg]["POPESTIMATE2020"]), int(pop[cg]["POPESTIMATE2024"])])
    rows.sort(key=lambda r: r[0])
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", newline="") as fo:
        wr = csv.writer(fo, lineterminator="\n")
        wr.writerow(COLS)
        wr.writerows(rows)
    print(f"ma_towns: {len(rows)} towns, pop2024 {sum(r[8] for r in rows):,} -> {out}")


if __name__ == "__main__":
    main()
