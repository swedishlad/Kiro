#!/usr/bin/env python3
"""Gate G-LIVE: the refreshed inputs are complete, plausible and continuous with the verified snapshot.

Run from the backend root after the fetchers:  python3 -m backend.live.verify_live
Checks data/build/grid_daily.csv and the staged EIA-861M files (data/build/eia_ma_*monthly.csv.new, else the build
copies). Exit 1 on any failure: the refresh stops and nothing is published.
"""
import csv
import datetime as dt
import os
import sys

import numpy as np

from backend.common import ROOT, ZONES, build_path, design, fit_weather, load_daily, month_dummies, weekend_flags
from backend.forecast.mc import level_ratio
from backend.live.fetch_eia861m import OUT, staged

MAX_LAG_DAYS = 21          # EIA posts ISO-NE zone data ~10 days late; 3 weeks without a new day = the feed stalled
MAX_LAG_MONTHS = 6         # EIA-861M runs ~2 months behind
SNAP = os.path.join(ROOT, "data", "snapshot")
ok = True


def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")


def grid(today):
    rows = list(csv.DictReader(open(build_path("grid_daily.csv"), newline="")))
    check("grid: header", list(rows[0].keys()) == ["date", "zone", "rt_mwh", "temp_f", "source"])
    dates = sorted({r["date"] for r in rows})
    first, last = dt.date.fromisoformat(dates[0]), dt.date.fromisoformat(dates[-1])
    check("grid: every day 2017-01-01 .. last, three zones each, no duplicates",
          first == dt.date(2017, 1, 1) and len(dates) == (last - first).days + 1 and len(rows) == 3 * len(dates)
          and all(sorted(r["zone"] for r in rows[i:i + 3]) == ZONES for i in range(0, len(rows), 3)), f"{first} .. {last}")
    snap = list(csv.DictReader(open(build_path("isone_ma_daily.csv"), newline="")))
    hist = [r for r in rows if r["source"] == "ISO-NE SMD"]
    check("grid: ISO-NE 2017-2023 rows identical to the verified snapshot (G-DATA-4)",
          [(r["date"], r["zone"], r["rt_mwh"], r["temp_f"]) for r in hist] ==
          [(r["date"], r["zone"], r["rt_mwh"], r["temp_f"]) for r in snap], f"{len(hist)} rows")
    live = [r for r in rows if r["source"] == "EIA-930"]
    check("grid: EIA-930 rows start 2024-01-01 and run to the last day", live and live[0]["date"] == "2024-01-01" and live[-1]["date"] == dates[-1])
    for z in ZONES:
        h = np.array([float(r["rt_mwh"]) for r in hist if r["zone"] == z])
        v = np.array([float(r["rt_mwh"]) for r in live if r["zone"] == z])
        t = np.array([float(r["temp_f"]) for r in live if r["zone"] == z])
        check(f"grid: {z} daily load inside 0.6x-1.4x of its 2017-2023 range, temperature -20..105 F",
              v.min() >= 0.6 * h.min() and v.max() <= 1.4 * h.max() and t.min() >= -20 and t.max() <= 105,
              f"load {v.min():,.0f}-{v.max():,.0f} MWh (history {h.min():,.0f}-{h.max():,.0f}), temp {t.min():.1f}-{t.max():.1f} F")
    check(f"grid: fresh (last day within {MAX_LAG_DAYS} days)", (today - last).days <= MAX_LAG_DAYS, f"last {last}, {(today - last).days} days ago")
    # seam: a weather model fit on ISO-NE 2022-2023 must explain the first EIA-930 year (no level or temperature jump)
    days, gwh, temp = load_daily()
    tr, te = (days >= dt.date(2022, 1, 1)) & (days <= dt.date(2023, 12, 31)), (days >= dt.date(2024, 1, 1)) & (days <= dt.date(2024, 12, 31))
    for z in ZONES:
        X = np.concatenate([design(temp[z], weekend_flags(days)), month_dummies(days)], axis=1)
        b = fit_weather(X[tr], gwh[z][tr])
        pred = X[te] @ b
        r = np.corrcoef(pred, gwh[z][te])[0, 1]
        miss = (gwh[z][te].sum() / pred.sum() - 1) * 100
        check(f"seam: {z} 2024 (EIA-930 + Open-Meteo) follows the ISO-NE 2022-23 weather model", abs(miss) < 6 and r > 0.85,
              f"level {miss:+.1f}%, corr {r:.3f}")
    # two independent federal sources must agree on how far load has grown since 2023
    grow930 = {z: gwh[z][-365:].sum() / gwh[z][[d.year == 2023 for d in days]].sum() for z in ZONES}
    tot930 = sum(gwh[z][-365:].sum() for z in ZONES) / sum(gwh[z][[d.year == 2023 for d in days]].sum() for z in ZONES)
    eia = level_ratio(staged(OUT["eia_total"]) if os.path.exists(staged(OUT["eia_total"])) else None)
    check("cross-source: EIA-930 load growth since 2023 matches EIA-861M retail sales growth (+/- 3 points)", abs(tot930 - eia) < 0.03,
          f"EIA-930 last 365 days / ISO-NE 2023 = {tot930:.4f} ({', '.join(f'{z} {g:.3f}' for z, g in grow930.items())}); "
          f"EIA-861M last 12 months / 2023 = {eia:.4f}")
    return last


def homes(today):
    for fn, name in OUT.items():
        path = staged(name) if os.path.exists(staged(name)) else build_path(name)
        rows = list(csv.DictReader(open(path, newline="")))
        ym = [(int(r["year"]), int(r["month"])) for r in rows]
        want = [(2010 + i // 12, i % 12 + 1) for i in range(len(rows))]
        col = "sales_mwh" if fn == "eia" else "total_sales_mwh"
        check(f"{name}: months contiguous from 2010-01, sales > 0", ym == want and all(float(r[col]) > 0 for r in rows),
              f"{ym[0][0]}-{ym[0][1]:02d} .. {ym[-1][0]}-{ym[-1][1]:02d} ({os.path.basename(path)})")
        lag = (today.year - ym[-1][0]) * 12 + today.month - ym[-1][1]
        check(f"{name}: fresh (last month within {MAX_LAG_MONTHS} months)", lag <= MAX_LAG_MONTHS, f"{lag} months")
        snap = {(r["year"], r["month"]): r for r in csv.DictReader(open(os.path.join(SNAP, name.replace(".csv", "_2026-08.csv")), newline=""))}
        new = {(r["year"], r["month"]): r for r in rows}
        final = [k for k, r in snap.items() if r["status"] == "Final"]
        drift = max(abs(float(new[k][col]) / float(snap[k][col]) - 1) for k in final if k in new) if final else 0
        check(f"{name}: Final months in the snapshot unchanged (within 0.5%)", all(k in new for k in final) and drift < 0.005,
              f"{len(final)} Final months, max drift {drift:.4%}")
    return ym[-1]


def main(today=None):
    today = today or dt.date.today()
    last = grid(today)
    ym = homes(today)
    print("G-LIVE:", "PASS" if ok else "FAIL", f"(grid through {last}, homes through {ym[0]}-{ym[1]:02d})")
    return ok, last, ym


if __name__ == "__main__":
    sys.exit(0 if main()[0] else 1)
