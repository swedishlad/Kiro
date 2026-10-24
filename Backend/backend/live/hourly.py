#!/usr/bin/env python3
"""Hourly Massachusetts grid load for the site's 3D surface -> data/build/grid_hourly.json.

Sums EIA-930 hourly demand of the three ISO-NE subregions (4006 SEMA, 4007 WCMA, 4008 NEMA) for every day that
data/build/grid_daily.csv has from EIA-930 (2024-01-01 .. its last day), so the surface and the daily models always
cover the same days. The local day has 23 / 25 hours at daylight-saving changes: the missing 2 am hour is filled with
the mean of its neighbours, and the doubled 1 am hour is averaged, so every day has 24 values (MW, the hour's MWh).
tempF = the day's Massachusetts temperature (population-weighted zones, as the models use).
Check: on every non-DST day the 24 hours add up to grid_daily.csv's daily total (fails loudly otherwise).
Usage (backend root, after backend.live.fetch_grid):  python3 -m backend.live.hourly
"""
import csv
import datetime as dt
import json
import os
import sys

from backend.common import ZONES, build_path, load_daily, with_ma, zone_population
from backend.live.fetch_grid import CODES, EIA930, HEADER, LIVE_FROM, RAW, get, half_years


def hourly_rows(last):
    """{date: {hour_number: MWh summed over the three zones}} from the six-month files (downloaded if missing)."""
    os.makedirs(RAW, exist_ok=True)
    out = {}
    for y, h in half_years(LIVE_FROM, last):
        path = os.path.join(RAW, f"EIA930_SUBREGION_{y}_{h}.csv")
        if not os.path.exists(path):
            get(EIA930.format(y=y, h=h), path)
        with open(path, newline="") as fh:
            rd = csv.reader(fh)
            if next(rd)[:5] != HEADER:
                sys.exit(f"EIA-930 header changed in {path}")
            for r in rd:
                if r[0] != "ISNE" or r[3] not in CODES or not r[4].strip():
                    continue
                d = dt.datetime.strptime(r[1], "%m/%d/%Y").date()
                if LIVE_FROM <= d <= last:
                    day = out.setdefault(d, {})
                    day[int(r[2])] = day.get(int(r[2]), 0.0) + float(r[4].replace(",", ""))
    return out


def to_24(values):
    """23 or 25 sequential local hours -> 24 (fill the skipped 2 am / average the doubled 1 am)."""
    if len(values) == 24:
        return values
    if len(values) == 23:
        return values[:2] + [(values[1] + values[2]) / 2] + values[2:]
    if len(values) == 25:
        return values[:1] + [(values[1] + values[2]) / 2] + values[3:]
    raise ValueError(f"{len(values)} hours")


def main():
    daily = [r for r in csv.DictReader(open(build_path("grid_daily.csv"), newline="")) if r["source"] == "EIA-930"]
    total = {}
    for r in daily:
        total[r["date"]] = total.get(r["date"], 0.0) + float(r["rt_mwh"])
    dates = sorted(total)
    first, last = dt.date.fromisoformat(dates[0]), dt.date.fromisoformat(dates[-1])
    rows = hourly_rows(last)
    days, gwh, temp = load_daily()
    _, temp = with_ma(gwh, temp, zone_population())
    t_at = {d.isoformat(): float(temp["MA"][i]) for i, d in enumerate(days)}
    mw, temps, bad = [], [], []
    for ds in dates:
        d = dt.date.fromisoformat(ds)
        hrs = rows.get(d, {})
        values = [hrs[k] for k in sorted(hrs)]
        if len(values) == 24 and abs(sum(values) - total[ds]) > 1.0:
            bad.append((ds, round(sum(values)), round(total[ds])))
        mw.append([round(v) for v in to_24(values)])
        temps.append(round(t_at[ds], 1))
    if bad:
        sys.exit(f"hourly sums disagree with grid_daily.csv on {len(bad)} days, e.g. {bad[:3]}")
    doc = {
        "area": "MA",
        "unit": "MW",
        "from": first.isoformat(),
        "to": last.isoformat(),
        "source": "EIA-930 hourly demand, ISO-NE subregions 4006 + 4007 + 4008 (all customer classes)",
        "zones": ZONES,
        "mw": mw,
        "tempF": temps,
    }
    with open(build_path("grid_hourly.json"), "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    flat = [v for day in mw for v in day]
    print(f"grid_hourly: {len(mw)} days x 24 h, {first} .. {last}; {min(flat):,}-{max(flat):,} MW; "
          f"hourly sums match the daily totals on every regular day")


if __name__ == "__main__":
    main()
