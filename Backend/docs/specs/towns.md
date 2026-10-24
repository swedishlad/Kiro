# Spec · D5 map data + D6 all-towns forecast (owner: city-model) → `data/build/towns_metrics.json`

Code: `backend/towns/build.py` (Python). Inputs: `ma_towns.csv` (G-DATA-5), `isone_ma_daily.csv`, `eia_ma_monthly.csv`, `eia_ma_total_monthly.csv`, `mc_forecast.json`, `regimes.json`. Contract: `TownsMetricsFile`. **Everything here is modeled**: no public town-level metered data exists (ground-truth.md).

## Fields (per town; zone = `zone_approx`, share = pop2024 ÷ zone pop2024)
| Field | Definition |
|---|---|
| `modeledAnnualMWh` | share × zone 2023 load (MWh) × 1.0435 |
| `modeledResidentialMWh` | pop2024 × MA residential kWh per person = (EIA residential sales, 12 months to 2026-08) ÷ (MA pop2024) ÷ 1000 |
| `perCapitaKwh` | modeledAnnualMWh × 1000 ÷ pop2024 (equal within a zone by construction: say so in `notes`) |
| `regimeColor` | the zone's `current.color` in regimes.json (as of 2023-12-31; say so) |
| `forecast6mMWh` | zone `total` quantiles from mc_forecast.json × share × 1000 (GWh → MWh) |
| `changeVsLastYearPct` | zone forecast p50 total ÷ Σ `sameMonthsLastObservedGWh` − 1 |
`zoneTotalsMWh[z]` = Σ towns in z of `modeledAnnualMWh` = zone 2023 load × 1.0435.

## Optional enrichment (only if TC gets a free Census API key: api.census.gov/data/key_signup.html)
ACS B25040 (heating fuel) and B25024 (units in structure) by town → scale residential intensity with the RECS coefficients (electric heat × e^0.420, apartment × e^−0.326), renormalize to the MA residential total. Keep `method` unchanged but add a `notes` line. Time box 30 min; skip if no key by 14:00.

## Gate G-CITY
`python3 tests/backend/towns/check_towns.py`: schema 0 errors; 351 towns with ids 1..351; zone sums reconcile (1e-6 relative); Σ zones = MA total; every `forecast6mMWh` ordered; Boston present with pop 673,458; `research/towns.md` states the method and its limits (commercial districts like downtown Boston are understated, zone boundaries approximate).
