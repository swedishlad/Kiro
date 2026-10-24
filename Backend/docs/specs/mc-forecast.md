# Spec · D3 Monte Carlo 6-month forecast (owner: forecaster) → `data/build/mc_forecast.json`

Code: `backend/forecast/mc.py` (Python + numpy, seeded). Contract: `McForecastFile`, `contracts/mc_forecast.schema.json`. The household version runs in the browser (`simulateBills`, bill-forecast.md §3b).

## 1. In plain words
We replay the last six Massachusetts winters' weather on next winter's calendar, add the kinds of "more or less than the weather explains" stretches the HMM found, scale to today's consumption level, and do it 10,000 times. The spread of outcomes is the forecast. We first test the method on two winters it never saw.

## 2. Simulation (per path, horizon 2026-11-01 … 2027-04-30, 181 days)
1. **Weather:** draw one historical season s ∈ {Nov 2017–Apr 2018, …, Nov 2022–Apr 2023} uniformly, with a random shift of −7…+7 days. All zones in a path use the same season (weather is regional).
2. **Calendar:** weekend flags for the 2026–27 dates.
3. **Weather load:** fitted GWh from the area's full-sample model (GWh ~ 1 + HDD + CDD + weekend + squares). Full-sample fitting is fine here: the forecast origin is after all data.
4. **Residual:** simulate a regime path from the final HMM (`regimes.json`: transition matrix, start from the stationary distribution) and draw each day's residual from that state's Normal(mean, sd). Zones draw independently (note it).
5. **Level:** × **1.0435** (EIA all-sector sales, last 12 months to Aug 2026 ÷ 2023; `levelAdjustment`). Disclose that the shape is 2017–2023.
6. Sum to months; MA = Σ zones per path. **10,000 paths, seed 20261024.**
Outputs per area: monthly quantiles p5…p95, 6-month `total`, 20 `samplePaths` (the first 20 paths), `sameMonthsLastObservedGWh` = Nov 2022 … Apr 2023 actual × 1.0435.

## 3. Calibration (walk-forward, honest badge)
- `trainEnd` = 2021-10-31. Fit the weather model and HMM on data ≤ trainEnd; simulate **Nov 2021–Apr 2022 and Nov 2022–Apr 2023** with their real calendars, weather drawn only from training seasons, level ratio 1.0 (in-sample level).
- Score 12 months × 3 zones = 36 area-months: `cov80` = share of actual monthly GWh inside p10–p90, `cov90` inside p5–p95, `maeVsNaive` = MAE(p50) ÷ MAE(same month, previous year).
- **Leakage test:** perturb all data after trainEnd → the calibration forecasts are bit-identical.
- Badge text (copy-compliance): "In 36 test months, 80% range contained the actual N% of the time." Never "accurate".

## 4. Gate (part of G-FC)
`python3 tests/backend/forecast/check_mc.py`: schema 0 errors; quantiles ordered; same seed → byte-identical file; calibration present with `nMonths = 36`; leakage test passes; `research/backtest.md` has the calibration table next to the M*/K* tables.
