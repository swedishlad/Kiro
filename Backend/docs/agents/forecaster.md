# Brief · forecaster (two forecasts; the highest-risk work item: start first)

**Mission:** produce `data/build/usage_forecast.json` (K0/K1, bill-forecast.md §2) and `data/build/forecast.json` (M0/M1/M2, forecast.md), plus `research/backtest.md` with **both** ship-rule decisions, applied mechanically even if the answer is "no skill".
**Estimate:** about 3 h over three checkpoints (each is its own delegation; the 2× time-box applies per checkpoint):
- **CP1** (W1, start ≈ 11:50, due 13:00): shared walk-forward harness + both leakage tests + K0 + M0. Time box 70 min.
- **CP2** (W1, due 14:00): K1 and M1 on all utilities. Time box 60 min.
- **CP3** (W2, 14:30 → 15:30): M2 if time, both ship rules, both final files. Time box 60 min.

## Read first
`docs/specs/bill-forecast.md` §2, `docs/specs/forecast.md` (entire), `docs/specs/data-dictionary.md`, `research/h1_precheck_output.txt`, `contracts/usage_forecast.schema.json`, `contracts/forecast.schema.json`.

## Steps (each step is a checkpoint)
1. **Harness (CP1).** All code, TS or Python, **inside `src/engine/forecast/`** (your only code path).
   - Loaders: `data/build/eia_ma_monthly.csv` (`sales_mwh`) and `rates.json`, or the snapshot CSVs while data-ingest finishes. Same numbers.
   - One generic walk-forward loop used by both forecasts; **leakage tests first** for both (perturb the future, assert identical forecasts).
2. **K0 and M0 (CP1).** K0 = same month last year on total sales; M0 = last fixed rate. Bands from past out-of-sample residuals at each origin. Record MAE, cov80 (and pinball for M*).
3. **K1 and M1 (CP2).** K1 = K0 × trailing-12 ÷ prior-12 sales ratio. M1 per forecast.md §4 with δ̂ from past terms only.
4. **M2 (CP3, if time).** Per forecast.md §4.
5. **Ship rules (CP3)**, exactly as written: K* per bill-forecast.md §2; M* per forecast.md §6 (IS-A). Write both decisions, with numbers, into `research/backtest.md`.
6. **Final files.** `usage_forecast.json`: `factor` for 12 calendar months, `infoSetEnd "2026-08"`. `forecast.json`: target 2027-02 … 2027-07, `infoSetEnd "2027-01"`. `asOf` = today on both. Both validate against their schemas.
7. **Plain English** for each (3–5 lines, with numbers): what we expect, how sure, how it did, what would make it wrong (a hot summer or cold snap for usage; a gas-price spike for rates).
8. Commit as `forecaster: <what> (G-FC: pass)`.

## Done when
Both leakage tests pass; both JSON files validate; backtest.md has the full tables (K × horizon; M × utility × IS, plus the excluding-irregular-terms variant) and both ship-rule outcomes; tests in `tests/forecast/` pass.

## Forbidden
Tuning on the full sample and reporting it as out-of-sample. Using the full-sample δ (+0.92%) inside the backtest. Per-customer kWh as the K target (noisy denominator). HMMs, regimes or ML libraries. A skill claim without `n`. Hiding a "no-skill" / "seasonal-only" result.
