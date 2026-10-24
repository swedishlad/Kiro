# Frontend contract: what the backend ships and what the site reads

Everything is committed under `Backend/`. The site (`Frontend/`) bundles `Backend/data/build/*` and `Backend/data/snapshot/*` at build time (no server, no runtime calls). **The grid, homes and town files refresh daily**: `.github/workflows/refresh-data.yml` runs `python3 -m backend.live.update` (EIA-930 + Open-Meteo + EIA-861M → every gate) plus `npm test` and `npm run build`, and commits only when all pass. The push redeploys the site, so **never hard-code a date or a value from these files**: read it (`live_status.json` has the data-through dates). `Frontend/src/data/data.test.ts` pins the site to these files: **regenerate the backend, then run `npm test` in `Frontend/`**; a failing test means the two have drifted.

## Files the site reads today

| File | Built by | What it holds | Used in (Frontend) |
|---|---|---|---|
| `data/build/consumption_stats.json` | `src/backend/build_stats.py` | Typical home, RECS distribution, "a home like yours" bands | Overview, Usage |
| `data/build/savings_model.json` | `src/backend/build_savings.py` | Money you could have saved vs the basic-service rate (worked examples) | Overview, Prices & savings |
| `data/build/map_consumption.json` | `src/backend/build_map.py` | Per-town map classes (RECS terciles, modeled) | Usage, Towns |
| `data/build/hmm_regimes.json` | `src/hmm/hmm_build.py` | **Level** model: Low / Mid / High use per month (raw kWh per account; follows the seasons by design) | Usage (labelled "level") |
| `data/build/regimes.json` | `backend/regimes/build.py` | **Range** model: Below / Within / Above the usual range (avg ± 1 sd of the same period in the previous 5 years); daily zones 2020 → the latest EIA-930 day (~10 days ago), homes monthly to the latest EIA month (~2 months ago); filtered states, `probs`, `outlook`, homes `forecast` | Overview, Regimes & forecast |
| `data/build/mc_forecast.json` | `backend/forecast/mc.py` | Monte Carlo for the 6 full months after the last observed day (now Nov 2026 – Apr 2027) per zone + MA; `backtest` (refit before each of 7 winters) is the honesty badge; `sameMonthsLastObservedGWh` = observed a year earlier | Overview, Regimes & forecast |
| `data/build/live_status.json` | `backend/live/update.py` | `gridThrough`, `homesThrough`, `forecastHorizon`, `sources`, `gates`: written only when every gate passed | Sources, Grid ("data through …") |
| `data/build/grid_daily.csv` | `backend/live/fetch_grid.py` | Daily load + temperature by zone: ISO-NE 2017–2023, then EIA-930 (gate G-LIVE) | input to the grid models |
| `data/build/eia_ma_monthly.csv`, `eia_ma_total_monthly.csv`, `ma_towns.csv`, `recs_ma.csv` | `reference/ingest_usage.py`, `reference/build_towns.py` | Verified inputs (G-DATA-3, G-DATA-5) | several tabs |
| `data/snapshot/*_residential_cents_2026-07-02.csv` | Mass.gov snapshot (G-DATA-1) | Basic-service rates 2005 – Jan 2027 | Prices & savings |
| `Frontend/src/geo/ma-towns.topo.json` | the frontend | Town shapes for the map | Towns |
| `data/build/climate_dashboard.json` | `backend/climate/build.py` | The Climate API's answer (`POST /api/climate/dashboard`, schema `contracts/climate_dashboard.schema.json`) for every household scenario the tab offers (`options`: monthly kWh × flexible kWh a day × battery kWh; the rest at `apiDefaults`), plus the model `assumptions`. Regional ISO-NE emissions profile and the seeded NumPy Monte Carlo, so it rebuilds the same on any machine. Not part of the daily refresh (no live inputs) | Climate |

## New since the site was written (ready to wire in)

| File / field | What to show | Must show |
|---|---|---|
| `data/build/towns_metrics.json` (`backend/towns/build.py`, gate G-CITY) | **Forecast for every town**: `towns[].forecast6mMWh` (p5…p95, Nov–Apr), `forecastMonthlyP50MWh` (6 months), `changeVsLastYearPct`, `modeledAnnualMWh`, `modeledResidentialMWh`, `perCapitaKwh`, `regimeColor`; join on `townId` = the map's town id | "**Modeled** from population share of zone; zones approximate by county" |
| `regimes.json` → `areas[MA_RES].forecast` | Next 6 months: `date`, `probs` [below, within, above], `color`, `method`, `skillVsLongRunMix` | Months with `method: "long-run-mix"` are not a forecast: label them "long-run odds" |
| `regimes.json` → `areas[].outlook[].method / skillVsLongRunMix / n` | Same outlook bars as now; add the method and skill as the honesty badge | "beat history by N% in M tests" only where `method = "ar1-gap"` |

## Field notes
- `regimes.json` timeline point: `pctVsAverage` (% vs the historical average), `bandPct` (half-width of the usual range, %), so the sd value is `pctVsAverage ÷ bandPct`; `probs` = filtered [P(below), P(within), P(above)]. States are anchored at −1.5 / 0 / +1.5 sd.
- Grid zones run to the latest day EIA has published (ISO-NE 2017–2023, EIA-930 since; EIA posts ISO-NE zone data ~10 days late); homes (`MA_RES`) to the latest EIA-861M month (~2 months late). Show both dates from `live_status.json`.
- `mc_forecast.json`: `levelAdjustment` is now `{source: "none: observed load", ratio: 1}`; the recent level is in `recentLevel` / `levelSdPct`. Quote `backtest` (cov80 0.80, median 4 % better than "same month last year", 6-month totals off 2.2 % on average), not `calibration` (kept for history).
- Colours always travel with a word and a shape (▼ ● ▲): green vs red fails colour-blind separation (ΔE 4.1).

## Specified but not built (not needed by the site)
`stats.json`, `estimate_model.json`, `usage_forecast.json`, `rates.json`, `forecast.json`, `towns.json` and the TypeScript functions `estimate()` / `savedVsBasic()` / `simulateBills()` in `docs/specs/` were planned before the team split; the site computes its estimator and savings calculator itself from the files above (parity-tested). Treat those specs as history.
