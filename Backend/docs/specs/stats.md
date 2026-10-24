# Spec · D1 stats + D2 examples (owner: stats-engine) → `data/build/stats.json`

Code: `backend/stats/build.py` (Python + numpy). Inputs: `data/build/isone_ma_daily.csv`, `eia_ma_monthly.csv`, `recs_ma.csv`, `rates.json`, `ma_towns.csv`. Contract: `StatsFile` (`contracts/types.ts`), `contracts/stats.schema.json`.

## Areas
NEMA, SEMA, WCMA from the daily file; **MA = the three zones summed per day**, with temperature = zone temperatures weighted by zone population 2024 (`ma_towns.csv`). Daily GWh = `rt_mwh / 1000`.

## Fields (per area, 2017-01-01 … 2023-12-31)
| Field | Definition |
|---|---|
| `annualGWh` | Σ daily GWh per calendar year (7 entries) |
| `meanDailyGWh` | mean daily GWh (must equal ground truth: NEMA 64.453, SEMA 38.001, WCMA 43.783 to 3 dp) |
| `peakDay` | day with the highest daily GWh |
| `peakHourMW` | highest `peak_mw` (for MA: the highest **sum of zone daily peaks**, non-coincident; say so in `notes`) |
| `monthlyProfileGWh` | mean over years of the calendar-month totals |
| `weekendVsWeekdayPct` | mean weekend day ÷ mean weekday − 1 |
| `temperature` | `gwhPerHDD`, `gwhPerCDD` from the **linear** model GWh ~ 1 + HDD + CDD + weekend (base 65 °F); `r2` from the full model with squared terms (must match G-DATA-4: 0.8403 / 0.8735 / 0.7996) |
| `loadFactor` | (Σ MWh ÷ hours) ÷ max hourly MW |
| `yoyChangePct` | 2023 ÷ 2022 − 1 |
| `weatherCostGWh2023` | Σ over 2023 of fitted(actual temperature) − fitted(normal temperature); normal = mean temperature for that day of year across 2017–2023, smoothed ± 7 days. Positive = weather made 2023 use more |

## Household block
`typicalAnnualKwh` / `typicalMonthlyKwh` (calendar 2025, sales ÷ 12-month mean customers: 7,135; 687 … 667), `medianBySqft` and `medianByHeat` (RECS weighted medians; equal ground truth), `basicServiceNow` (rates.json `current`), `allInPrice` (latest EIA month: 2026-08, 30.48), and `savingsExamples`: `savedVsBasic` (calculator.md §7) on the typical 2025 monthly kWh for NG at **example** rates 14.0, 18.9 and 22.0 ¢/kWh over the 12 months 2026-02 … 2027-01 (label them "example").

## Gate G-STATS
`python3 -m backend.stats.build` writes the file; `python3 tests/backend/stats/check_stats.py` asserts: schema 0 errors; the ground-truth equalities above; MA `annualGWh` = Σ zones (to 0.01 GWh); `weatherCostGWh2023` finite; `research/stats.md` lists every field with its value.
