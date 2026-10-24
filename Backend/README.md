# FairWatt Backend

Python backend-only calculation modules for the FairWatt Massachusetts household energy planner.
The web frontend is built separately and consumes the committed JSON artifacts under `data/build/`.

## Deliverables

| Area | Code | Output artifact |
|---|---|---|
| Energy consumption stats | `src/backend/stats_consumption.py`, `build_stats.py` | `data/build/consumption_stats.json` |
| Money-you-could-have-saved (vs basic-service rate) | `src/backend/savings_model.py`, `build_savings.py` | `data/build/savings_model.json` |
| Per-town map data (green/grey/red traffic light) | `src/backend/map_consumption.py`, `build_map.py` | `data/build/map_consumption.json` |
| HMM 3-state energy-use regime model | `src/hmm/` | `data/build/hmm_regimes.json` |
| HMM regimes vs the **historical average range** (red = above, grey = within, green = below; range = avg ± 1 sd of the same period in the previous 5 years; ISO-NE zones daily + MA homes monthly to 2026-08; no look-ahead) | `backend/regimes/` | `data/build/regimes.json` |
| Walk-forward-calibrated **Monte Carlo**, 6 months (Nov 2026 – Apr 2027), per zone + MA | `backend/forecast/mc.py` | `data/build/mc_forecast.json` |
| Monte Carlo core on the EIA monthly series (in progress) | `forecast_mc_core.py` | — |
| **Forecast for all 351 towns** (modeled: population share of zone × zone Monte Carlo; Nov 2026 – Apr 2027) | `backend/towns/build.py` | `data/build/towns_metrics.json` |
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
python3 tests/backend/make_test_charts.py          # charts of the test results -> docs/img/tests/
# rebuild: python3 -m backend.regimes.build, then python3 -m backend.forecast.mc, then python3 -m backend.towns.build
# frontend contract (what the site reads): docs/FRONTEND_CONTRACT.md
```

40 tests (32 backend + 8 HMM).
