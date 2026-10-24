#!/usr/bin/env python3
"""Aggregate ISO New England's hourly SMD workbooks to one daily table for the three Massachusetts load zones.

Usage:
  python3 reference/ingest_isone.py data/raw/isone data/build/isone_ma_daily.csv      # reads <dir>/YYYY_smd_hourly.xlsx
  python3 reference/ingest_isone.py --from-snapshot data/snapshot/isone_ma_daily_2017-2023.csv data/build/isone_ma_daily.csv
Verify with reference/verify_isone.py (G-DATA-4).

Source (docs/apis/09-isone-zonal-load.md): https://www.iso-ne.com/static-assets/documents/<YYYY>/02/<YYYY>_smd_hourly.xlsx
(2017-2023 resolve; 2024+ and pre-2017 were not found at that pattern). Sheets NEMA (Northeast MA incl. Boston),
SEMA (Southeast MA), WCMA (West/Central MA). Per hour: DA_Demand and RT_Demand in MW, Dry_Bulb and Dew_Point in F.
RT_Demand is wholesale settlement load of ALL customer classes (not residential only), net of behind-the-meter
generation. Daily MWh = sum of the day's hourly MW (the fall-back day has 25 rows incl. hour "02X", spring-forward 23).
Needs openpyxl only for the XLSX path.
"""
import csv
import glob
import os
import shutil
import sys
from collections import OrderedDict

ZONES = ["NEMA", "SEMA", "WCMA"]
COLS = ["date", "zone", "rt_mwh", "da_mwh", "peak_mw", "temp_f", "dewpoint_f", "hours"]


def aggregate(path, acc):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for zone in ZONES:
        rows = wb[zone].iter_rows(values_only=True)
        head = next(rows)
        want = ["Date", "Hr_End", "DA_Demand", "RT_Demand", "Dry_Bulb", "Dew_Point"]
        if any(w not in head for w in want):
            sys.exit(f"{path} sheet {zone}: unexpected header {head}")
        ix = {w: head.index(w) for w in want}
        for r in rows:
            if r[ix["Date"]] is None:
                continue
            rt, da, tb, dp = (r[ix[k]] for k in ("RT_Demand", "DA_Demand", "Dry_Bulb", "Dew_Point"))
            if rt is None or da is None or tb is None or dp is None:
                sys.exit(f"{path} {zone} {r[ix['Date']].date()} hour {r[ix['Hr_End']]}: missing value")
            d = r[ix["Date"]].date().isoformat()
            a = acc.setdefault((d, zone), {"rt": 0.0, "da": 0.0, "peak": 0.0, "t": 0.0, "dp": 0.0, "n": 0})
            a["rt"] += float(rt)
            a["da"] += float(da)
            a["peak"] = max(a["peak"], float(rt))
            a["t"] += float(tb)
            a["dp"] += float(dp)
            a["n"] += 1


def main():
    args = sys.argv[1:]
    if len(args) == 3 and args[0] == "--from-snapshot":
        os.makedirs(os.path.dirname(args[2]) or ".", exist_ok=True)
        shutil.copyfile(args[1], args[2])
        print(f"copied snapshot -> {args[2]}")
        return
    if len(args) != 2:
        sys.exit(__doc__)
    src, out = args
    files = sorted(glob.glob(os.path.join(src, "*_smd_hourly.xlsx")))
    if not files:
        sys.exit(f"no *_smd_hourly.xlsx in {src}")
    acc = {}
    for f in files:
        aggregate(f, acc)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", newline="") as fo:
        wr = csv.writer(fo, lineterminator="\n")
        wr.writerow(COLS)
        for (d, zone), a in sorted(acc.items(), key=lambda kv: (kv[0][0], ZONES.index(kv[0][1]))):
            wr.writerow([d, zone, f"{a['rt']:.3f}", f"{a['da']:.3f}", f"{a['peak']:.3f}",
                         f"{a['t'] / a['n']:.2f}", f"{a['dp'] / a['n']:.2f}", a["n"]])
    days = len({d for d, _ in acc})
    print(f"isone_ma_daily: {len(acc)} rows ({days} days x {len(ZONES)} zones) from {len(files)} files -> {out}")


if __name__ == "__main__":
    main()
