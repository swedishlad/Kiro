#!/usr/bin/env python3
"""Live grid data: extend the verified ISO-NE daily history (2017-2023) to the latest day EIA has published.

Sources (keyless; validated Oct 24 2026 against the ISO-NE snapshot, docs/apis/11-live-grid-data.md):
  load         EIA-930 hourly demand by ISO-NE subregion, six-month CSVs:
               https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_SUBREGION_<YYYY>_<Jan_Jun|Jul_Dec>.csv
               4006 = SEMA, 4007 = WCMA, 4008 = NEMA (2019 overlap with ISO-NE: corr 0.9997, level 0.9996-0.9998).
               EIA fills ISO-NE subregion demand about 10 days after the fact; rows for newer hours exist but are empty.
  temperature  Open-Meteo daily mean (archive API, then the forecast API's past_days for the newest days), deg F, at
               the airport points that best match ISO-NE's zone temperatures 2017-2023 (corr 0.994-0.996, MAE
               1.1-1.4 F); the mean bias found then is removed so the series stays on the ISO-NE scale.
Writes data/build/grid_daily.csv (date, zone, rt_mwh, temp_f, source): the ISO-NE rows through 2023-12-31 unchanged,
then EIA-930 rows from 2024-01-01 to the last day on which every zone has its full local day of hours (23 / 24 / 25
at daylight-saving changes) and a temperature. A missing day before that is a hole in the source: fail closed.
Usage (backend root):  python3 -m backend.live.fetch_grid        (downloads into data/raw/live/, gitignored)
"""
import csv
import datetime as dt
import json
import os
import sys
import time
import urllib.request
from zoneinfo import ZoneInfo

from backend.common import ROOT, ZONES, build_path

EIA930 = "https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_SUBREGION_{y}_{h}.csv"
HEADER = ["Balancing Authority", "Data Date", "Hour Number", "Sub-Region", "Demand (MW)"]
CODES = {"4006": "SEMA", "4007": "WCMA", "4008": "NEMA"}
POINTS = {"NEMA": (42.36, -71.01, -1.36), "SEMA": (41.72, -71.43, -0.24), "WCMA": (42.27, -71.87, 0.24)}  # lat, lon, bias F
LIVE_FROM = dt.date(2024, 1, 1)
RAW = os.path.join(ROOT, "data", "raw", "live")
TZ = ZoneInfo("America/New_York")
UA = {"User-Agent": "FairWatt data refresh (hackathon project, github.com/swedishlad/Kiro)"}


def get(url, path=None, timeout=180, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                data = r.read()
            break
        except OSError:                             # URLError, HTTPError and timeouts are all OSError
            if k == tries - 1:
                raise
            time.sleep(20 * (k + 1))
    if path:
        with open(path, "wb") as fh:
            fh.write(data)
    return data


def half_years(start, end):
    y, h = start.year, 0 if start.month <= 6 else 1
    while (y, h) <= (end.year, 0 if end.month <= 6 else 1):
        yield y, ("Jan_Jun" if h == 0 else "Jul_Dec")
        y, h = (y, 1) if h == 0 else (y + 1, 0)


def local_hours(d):
    """Hours in the local (Eastern) day: 24, or 23 / 25 on the daylight-saving change days."""
    a = dt.datetime(d.year, d.month, d.day, tzinfo=TZ).astimezone(dt.timezone.utc)   # same-tz subtraction ignores DST
    b = dt.datetime.combine(d + dt.timedelta(1), dt.time(), tzinfo=TZ).astimezone(dt.timezone.utc)
    return round((b - a).total_seconds() / 3600)


def eia930_daily(today):
    """{(date, zone): [mwh, hours with a value]} from the six-month files covering LIVE_FROM .. today."""
    os.makedirs(RAW, exist_ok=True)
    acc = {}
    for y, h in half_years(LIVE_FROM, today):
        path = os.path.join(RAW, f"EIA930_SUBREGION_{y}_{h}.csv")
        get(EIA930.format(y=y, h=h), path)
        with open(path, newline="") as fh:
            rd = csv.reader(fh)
            head = next(rd)
            if head[:5] != HEADER:
                sys.exit(f"EIA-930 header changed in {path}: {head[:5]}")
            for r in rd:
                if r[0] != "ISNE" or r[3] not in CODES or not r[4].strip():
                    continue
                d = dt.datetime.strptime(r[1], "%m/%d/%Y").date()
                a = acc.setdefault((d, CODES[r[3]]), [0.0, 0])
                a[0] += float(r[4].replace(",", ""))
                a[1] += 1
    return acc


def temperatures(start, end):
    """{(date, zone): temp_f on the ISO-NE scale} from Open-Meteo (archive first, forecast past_days for the gap)."""
    out = {}
    arc_end = min(end, dt.date.today() - dt.timedelta(7))   # the archive trails by days; past_days covers the rest
    for z, (lat, lon, bias) in POINTS.items():
        base = (f"latitude={lat}&longitude={lon}&daily=temperature_2m_mean&temperature_unit=fahrenheit"
                f"&timezone=America%2FNew_York")
        arc = json.loads(get(f"https://archive-api.open-meteo.com/v1/archive?{base}&start_date={start}&end_date={arc_end}"))
        rec = json.loads(get(f"https://api.open-meteo.com/v1/forecast?{base}&past_days=14&forecast_days=1"))
        for src in (rec, arc):                      # archive wins where both exist
            for t, v in zip(src["daily"]["time"], src["daily"]["temperature_2m_mean"]):
                d = dt.date.fromisoformat(t)
                if v is not None and start <= d <= end:
                    out[(d, z)] = round(v - bias, 2)
    return out


def complete(load, d):
    return all(load.get((d, z), (0, 0))[1] == local_hours(d) for z in ZONES)


def main(today=None):
    today = today or dt.date.today()
    hist = list(csv.DictReader(open(build_path("isone_ma_daily.csv"), newline="")))
    load = eia930_daily(today)
    days = sorted({d for d, _ in load if d < today})
    full = [d for d in days if complete(load, d)]
    if not full:
        sys.exit("EIA-930: no complete day since 2024-01-01")
    temps = temperatures(LIVE_FROM, full[-1])
    last = LIVE_FROM - dt.timedelta(1)
    while complete(load, last + dt.timedelta(1)) and all((last + dt.timedelta(1), z) in temps for z in ZONES):
        last += dt.timedelta(1)
    later = [d for d in full if d > last + dt.timedelta(1)]
    if len(later) > 3:                              # complete days after a missing one: a hole, not publication lag
        bad = last + dt.timedelta(1)
        sys.exit(f"hole in the live data at {bad}: hours {[load.get((bad, z), (0, 0))[1] for z in ZONES]} "
                 f"(expected {local_hours(bad)}), temperature {[(bad, z) in temps for z in ZONES]}; {len(later)} later days are complete")
    rows = [[r["date"], r["zone"], r["rt_mwh"], r["temp_f"], "ISO-NE SMD"] for r in hist]
    d = LIVE_FROM
    while d <= last:
        rows += [[d.isoformat(), z, f"{load[(d, z)][0]:.3f}", f"{temps[(d, z)]:.2f}", "EIA-930"] for z in ZONES]
        d += dt.timedelta(1)
    with open(build_path("grid_daily.csv"), "w", newline="") as fh:
        wr = csv.writer(fh, lineterminator="\n")
        wr.writerow(["date", "zone", "rt_mwh", "temp_f", "source"])
        wr.writerows(rows)
    print(f"grid_daily: {len(rows)} rows, 2017-01-01 .. {last} (EIA-930 from {LIVE_FROM}; "
          f"newest complete hour data {full[-1]}, {(today - last).days} days before {today})")
    return last


if __name__ == "__main__":
    main()
