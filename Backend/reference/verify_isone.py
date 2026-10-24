#!/usr/bin/env python3
"""G-DATA-4: verify the ISO-NE Massachusetts daily load snapshot against reference checksums.

Usage:  python3 reference/verify_isone.py data/snapshot/isone_ma_daily_2017-2023.csv   (or data/build/isone_ma_daily.csv)
Exit 0 = pass, 1 = fail. Stdlib for the checksums; numpy (optional) for the derived regression checks.

Checksums computed Oct 24 2026 by reference/ingest_isone.py from the 7 workbooks {YYYY}_smd_hourly.xlsx, 2017-2023
(sha256 prefixes: 2017 7e1b88665861, 2018 85ae3c5f7042, 2019 f48acf50ba33, 2020 0d18655baa42, 2021 e54535a1f9d9,
2022 051d0cbdc55e, 2023 db787a1a40c6). The DERIVED checks recompute the numbers quoted in .kiro/steering/ground-truth.md.
"""
import csv
import datetime as dt
import sys
from collections import Counter

ZONES = ["NEMA", "SEMA", "WCMA"]
DAYS, FIRST, LAST = 2556, "2017-01-01", "2023-12-31"
SUMS = {  # per zone: (sum rt_mwh x1000, sum da_mwh x1000, sum peak_mw x1000, sum temp_f x100)
    "NEMA": (164741399613, 162447747350, 8004081612, 13639485),
    "SEMA": (97131587239, 93964776550, 4970272319, 13580957),
    "WCMA": (111909805321, 119598848050, 5526863446, 12679506),
}
ANCHOR = ("2017-01-01", "NEMA", 60688.767)
DERIVED = {  # zone: (mean GWh/day, R2 of daily load on temperature+weekend, lag-1 autocorrelation of the residual)
    "NEMA": (64.453, 0.8403, 0.5930), "SEMA": (38.001, 0.8735, 0.5328), "WCMA": (43.783, 0.7996, 0.6081)}


def report(label, got, want):
    ok = got == want
    print(f"{label:34s} {'ok' if ok else 'FAIL'}  got={got} want={want}")
    return ok


def derived(zone_rows):
    import numpy as np
    y = np.array([float(r["rt_mwh"]) for r in zone_rows]) / 1000
    t = np.array([float(r["temp_f"]) for r in zone_rows])
    wk = np.array([dt.date.fromisoformat(r["date"]).weekday() >= 5 for r in zone_rows], float)
    hdd, cdd = np.maximum(65 - t, 0), np.maximum(t - 65, 0)
    X = np.column_stack([np.ones_like(t), hdd, cdd, wk, hdd ** 2 * 0.01, cdd ** 2 * 0.01])
    res = y - X @ np.linalg.lstsq(X, y, rcond=None)[0]
    return (round(float(y.mean()), 3), round(float(1 - res.var() / y.var()), 4),
            round(float(np.corrcoef(res[1:], res[:-1])[0, 1]), 4))


def check(path):
    rows = list(csv.DictReader(open(path, newline="")))
    ok = report("[isone] rows", len(rows), DAYS * 3)
    ok &= report("[isone] hours per row", dict(Counter(int(r["hours"]) for r in rows)), {24: DAYS * 3})
    dates = sorted({r["date"] for r in rows})
    ok &= report("[isone] first / last / days", (dates[0], dates[-1], len(dates)), (FIRST, LAST, DAYS))
    d0 = dt.date.fromisoformat(FIRST)
    ok &= report("[isone] no calendar gaps", dates == [(d0 + dt.timedelta(i)).isoformat() for i in range(DAYS)], True)
    by = {z: [r for r in rows if r["zone"] == z] for z in ZONES}
    for z in ZONES:
        got = (sum(round(float(r["rt_mwh"]) * 1000) for r in by[z]), sum(round(float(r["da_mwh"]) * 1000) for r in by[z]),
               sum(round(float(r["peak_mw"]) * 1000) for r in by[z]), sum(round(float(r["temp_f"]) * 100) for r in by[z]))
        ok &= report(f"[isone] {z} rows / sums", (len(by[z]),) + got, (DAYS,) + SUMS[z])
    a = next((float(r["rt_mwh"]) for r in by[ANCHOR[1]] if r["date"] == ANCHOR[0]), None)
    ok &= report(f"[isone] anchor {ANCHOR[0]} {ANCHOR[1]}", a, ANCHOR[2])
    try:
        for z in ZONES:
            ok &= report(f"[isone] DERIVED {z} mean/R2/ac1", derived(by[z]), DERIVED[z])
    except ImportError:
        print("[isone] DERIVED checks skipped (numpy not installed)")
    return ok


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    good = check(sys.argv[1])
    print("G-DATA-4:", "PASS" if good else "FAIL")
    sys.exit(0 if good else 1)
