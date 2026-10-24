# 11 · Live data: EIA-930 grid load (S19), Open-Meteo temperature (S20), EIA-861M refresh (S15)

**Status:** validated Oct 24 2026 and refreshed daily by `.github/workflows/refresh-data.yml` → `python3 -m backend.live.update`
(fetch → G-LIVE → rebuild → every gate). The site still makes **zero runtime API calls**: the refresh runs at build time
in CI and commits new JSON, and the push redeploys the site.

## Why these sources
ISO-NE's own SMD files (S17) stop at 2023 at the known URL pattern (doc 09), and its web services need an account. EIA-930
republishes ISO-NE's hourly demand by subregion, with no key, and its 2019 values match the ISO-NE files almost exactly.

## EIA-930 hourly demand by ISO-NE subregion (S19)
- Files: `https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_SUBREGION_<YYYY>_<Jan_Jun|Jul_Dec>.csv` (no key;
  every US balancing authority's subregions). Header: `Balancing Authority, Data Date, Hour Number, Sub-Region, Demand (MW),
  Local Time at End of Hour, UTC Time at End of Hour`. `Data Date` and `Hour Number` are **local** (Eastern): 23 rows on the
  March daylight-saving day, 25 in November, the same convention as the ISO-NE daily sums.
- Codes for `ISNE`: **4006 = SEMA, 4007 = WCMA, 4008 = NEMA**. Checked on the 2019 H1 overlap with the ISO-NE files, hour by
  hour: corr 0.9997 for each zone; mean ratio EIA/ISO 0.9998 (SEMA), 0.9996 (WCMA), 0.9996 (NEMA).
- **Lag:** EIA fills ISO-NE subregion demand about **10 days late**. Rows for newer hours exist with an empty demand, so the
  fetcher keeps only days on which all three zones have every local hour (Oct 24: data through Oct 14).
- An undocumented JSON route behind the Grid Monitor (`/electricity/930-api/region_data/series_data`) returns the ISNE total
  sooner, but no subregion route answered: **not used**.

## Open-Meteo temperature (S20)
- Archive: `https://archive-api.open-meteo.com/v1/archive?latitude=..&longitude=..&daily=temperature_2m_mean&temperature_unit=fahrenheit&timezone=America%2FNew_York&start_date=..&end_date=..`
  (no key). The newest days come from the forecast API's `past_days=14`, and the archive wins where both exist.
- Points that best match ISO-NE's zone `Dry_Bulb` (daily means, 2017–2023, the snapshot as truth):

| Zone | Point | corr | mean bias (Open-Meteo − ISO-NE) | MAE |
|---|---|---|---|---|
| NEMA | Boston Logan 42.36, −71.01 | 0.9942 | −1.36 °F | 1.39 °F |
| SEMA | Providence 41.72, −71.43 | 0.9964 | −0.24 °F | 1.10 °F |
| WCMA | Worcester 42.27, −71.87 | 0.9963 | +0.24 °F | 1.21 °F |

  The fetcher subtracts each bias, so the 2024+ series continues the ISO-NE scale that the weather models were built on.

## EIA-861M (S15) refresh
The same `sales_revenue.xlsx` as doc 08, re-downloaded and parsed by `reference/ingest_usage.py` into **staged** `.new` files.
They replace `data/build/eia_ma_monthly.csv` / `eia_ma_total_monthly.csv` only after G-LIVE passes. EIA posts a month
about two months later (Oct 24: through 2026-08).

## Output: `data/build/grid_daily.csv`
`date, zone, rt_mwh, temp_f, source`: the 7,668 verified ISO-NE rows (2017-01-01 … 2023-12-31, `source = ISO-NE SMD`) unchanged,
then `EIA-930` rows from 2024-01-01 to the last complete day. Every backend model reads this file (`backend/common.load_daily`).

## Gate G-LIVE (`python3 -m backend.live.verify_live`), Oct 24 run
- Every day 2017-01-01 … last day, three zones each; ISO-NE rows identical to the snapshot; EIA-930 load inside 0.6×–1.4×
  of each zone's 2017–2023 range; temperatures −20…105 °F; last day within 21 days of today.
- **Seam:** a weather model fit on ISO-NE 2022–23 explains EIA-930 2024: level +1.1 % / +1.1 % / −0.1 % (NEMA / SEMA /
  WCMA), corr 0.963 / 0.963 / 0.942.
- **Two federal sources agree on growth:** EIA-930 load, last 365 days ÷ ISO-NE 2023 = **1.050** (NEMA 1.054, SEMA 1.057,
  WCMA 1.040). EIA-861M all-sector retail sales, last 12 months ÷ 2023 = **1.0435**. The gate allows ±3 points.
- EIA-861M: months contiguous from 2010-01; within 6 months of today; the snapshot's 192 Final months are unchanged (max
  drift 0.0000 %).

## What "live" means here
Daily, not real time: every refresh picks up whatever EIA and Open-Meteo have published since the last one. Expect grid
data about 10 days old and household data about 2 months old. `data/build/live_status.json` carries both dates for the UI.
