# Watt If Backend

Python backend-only calculation modules for the Watt If Massachusetts household energy planner.
The web frontend is built separately and consumes the committed JSON artifacts under `data/build/`.

## Deliverables

| Area | Code | Output artifact |
|---|---|---|
| Energy consumption stats | `src/backend/stats_consumption.py`, `build_stats.py` | `data/build/consumption_stats.json` |
| Money-you-could-have-saved (vs basic-service rate) | `src/backend/savings_model.py`, `build_savings.py` | `data/build/savings_model.json` |
| Per-town map data (green/grey/red traffic light) | `src/backend/map_consumption.py`, `build_map.py` | `data/build/map_consumption.json` |
| HMM 3-state energy-use regime model | `src/hmm/` | `data/build/hmm_regimes.json` |
| HMM regimes vs the **historical average range** (red = above, grey = within, green = below; range = avg ± 1 sd of the same period in the previous 5 years; ISO-NE zones daily + MA homes monthly to 2026-08; no look-ahead) | `backend/regimes/` | `data/build/regimes.json` |
| Walk-forward-calibrated **Monte Carlo**, the 6 full months after the latest data (now Nov 2026 – Apr 2027), per zone + MA; backtested on 7 winters | `backend/forecast/mc.py` | `data/build/mc_forecast.json` |
| Monte Carlo core on the EIA monthly series (in progress) | `forecast_mc_core.py` | — |
| **Forecast for all 351 towns** (modeled: population share of zone × zone Monte Carlo, same rolling horizon) | `backend/towns/build.py` | `data/build/towns_metrics.json` |
| **Live data, refreshed daily**: EIA-930 grid load + Open-Meteo temperature + EIA-861M, verified (G-LIVE), then every model rebuilt and gated; GitHub Actions commits only when all pass | `backend/live/`, `.github/workflows/refresh-data.yml` | `data/build/grid_daily.csv`, `live_status.json` |
| **Future regime** for homes (next 6 months; tested gap forecast where it beats the long-run odds) | `backend/regimes/build.py` | `regimes.json` → `forecast`, `outlook` |

## Data

- `data/snapshot/` — verified input data (552 RECS 2020 MA homes, EIA-861M monthly series, 22 years of residential rates, ISO-NE daily, MA towns).
- `data/build/` — generated JSON artifacts the frontend reads.

## Conventions

- Green/grey/red map classes use weighted terciles of the RECS annual-kWh distribution (GREEN ≤ P33 < GREY ≤ P66 < RED).
- Per-town consumption level is a statewide model (`modeled: true`) — there is no verified per-town usage source in the data, so this is labeled honestly rather than invented.
- HMM states are sorted by mean consumption: GREEN (low) < GREY (mid) < RED (high), seed 42 for reproducibility.
- Savings are the supply portion only; positive = saved, negative = overpaid.
- Two HMMs live here. `src/hmm/` classifies the raw monthly kWh level, so its colors largely follow the season (July red, April green). `backend/regimes/` compares each day (zones) or month (homes) with the **same period in the previous 5 years**: red = above that historical average range, grey = within, green = below; no look-ahead, and no calendar month is mostly red. Example output charts: `docs/img/examples/`. Method, tests and charts: `research/regimes.md`, `research/mc_backtest.md`, `docs/img/tests/`.

## Verify

```bash
python3 -m pytest tests -q                         # stats, savings, map, src/hmm
python3 tests/backend/regimes/check_regimes.py     # G-HMM: leakage, ordering, not-seasonal checks
python3 tests/backend/forecast/check_mc.py         # Monte Carlo: walk-forward calibration, leakage, reproducibility
python3 tests/backend/towns/check_towns.py         # G-CITY: 351 towns, sums reconcile with each zone
python3 -m backend.live.verify_live                # G-LIVE: live inputs complete, plausible, continuous with the snapshot
python3 tests/backend/make_test_charts.py          # charts of the test results -> docs/img/tests/
# refresh everything from the live sources (what CI runs daily): python3 -m backend.live.update
# rebuild only: python3 -m backend.regimes.build, then python3 -m backend.forecast.mc, then python3 -m backend.towns.build
# frontend contract (what the site reads): docs/FRONTEND_CONTRACT.md
```

## Live data

`.github/workflows/refresh-data.yml` runs every day (and on demand from the Actions tab):
1. Fetch: EIA-930 hourly load for the three MA zones (no key; EIA posts it ~10 days late), Open-Meteo temperature
   (bias-corrected to ISO-NE's points), and the EIA-861M monthly file (~2 months late).
2. Verify: gate G-LIVE checks completeness and ranges, that the 2017–2023 history is unchanged, the 2023/2024 seam, and that
   the two federal sources agree on load growth since 2023 (Oct 24: +5.0 % vs +4.35 %).
3. Rebuild and gate: regimes → Monte Carlo → 351 towns; G-HMM, G-FC, G-CITY, schemas, pytest (`tests/backend`, `tests/hmm`);
   then the frontend regenerates the "Ask Watt If" knowledge base (`npm run knowledge`) and runs `npm test` and `npm run build`.
4. Publish: `data/build/` and `Frontend/server/knowledge.ts` are committed only if all of it passed and new data arrived. The push
   redeploys the site. Any failure publishes nothing, so the site keeps its last good numbers.

Sources and validation: `docs/apis/11-live-grid-data.md`. Freshness for the UI: `data/build/live_status.json`.

40 tests (32 backend + 8 HMM).
