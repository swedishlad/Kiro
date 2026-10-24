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
| Walk-forward / Monte Carlo forecast | `backend/`, `forecast_mc_core.py` | `data/build/regimes.json` |

## Data

- `data/snapshot/` — verified input data (552 RECS 2020 MA homes, EIA-861M monthly series, 22 years of residential rates, ISO-NE daily, MA towns).
- `data/build/` — generated JSON artifacts the frontend reads.

## Conventions

- Green/grey/red map classes use weighted terciles of the RECS annual-kWh distribution (GREEN ≤ P33 < GREY ≤ P66 < RED).
- Per-town consumption level is a statewide model (`modeled: true`) — there is no verified per-town usage source in the data, so this is labeled honestly rather than invented.
- HMM states are sorted by mean consumption: GREEN (low) < GREY (mid) < RED (high), seed 42 for reproducibility.
- Savings are the supply portion only; positive = saved, negative = overpaid.

## Verify

```bash
python3 -m pytest tests -q
```

40 tests (32 backend + 8 HMM).
