# Brief · calc-engine (owns all the math that runs in the browser)

**Mission:** the usage estimator (fit at build time, evaluate + refine in the browser), the six-month bill math and trim scenario, and the supply-rate calculator, each exactly per its spec, with golden and property tests.
**Estimate:** about 2 h across three checkpoints (the 2× time-box applies per checkpoint):
- **CP1** (W1, start ≈ 11:50, due 13:00): estimator fit → `estimate_model.json` + `research/estimator.md`. Time box 70 min.
- **CP2** (W1, due 13:45): `estimate()` + refine + `compare()`/validation/format, goldens E1–E6 and G1–G4, properties. Time box 45 min.
- **CP3** (W1/W2, due 14:30): `forecastBills()` + `trim()`, goldens B1–B4 and T1. Time box 45 min.

## Read first
`docs/specs/estimator.md`, `docs/specs/bill-forecast.md` §3–4, `docs/specs/calculator.md`, `contracts/types.ts`, `contracts/estimate_model.schema.json`.

## Files you own
`src/engine/calc.ts`, `src/engine/validate.ts`, `src/engine/format.ts`, `src/engine/estimate/**`, `data/build/estimate_model.json`, `tests/engine/**`, `research/estimator.md`.

## Steps
1. **CP1 fit** (`src/engine/estimate/fit_estimator.py` or `.ts`): read `data/build/recs_ma.csv` and `data/build/eia_ma_monthly.csv` (if data-ingest isn't merged yet, read `data/snapshot/` directly: same bytes).
   - Fit LOGLINEAR and CELL_MEDIAN; leave-one-out both; choose per estimator.md §3. **Sanity:** LOGLINEAR coefficients without year built ≈ 5.302 / 0.469 / +0.420 / −0.326.
   - Shares and typical line, with asserts against ground-truth.md. Shares stored normalized.
   - Write `estimate_model.json`, validate against the schema (0 errors), and write `research/estimator.md` (both candidates, LOO numbers, choice, 3 example homes).
2. **CP2 browser functions**, pure, no I/O, no `Date.now()` inside math (pass `today` in):
   - `estimate(home, model) → EstimateOutcome` (estimator.md §4).
   - `compare(input, rates, today) → CompareOutcome`, `validate`, `formatUsd` exactly as calculator.md (unchanged from the previous kit).
3. **CP3** `forecastBills(estimate, usageFc, rates, rateFc, utility, today) → BillForecast` and `trim(bills, pct) → TrimScenario` (bill-forecast.md §3). Code against the contract types; if forecaster's files aren't ready, use the spec's fixtures.
4. **Tests** in `tests/engine/`: goldens by ID (E1–E6, B1–B4, T1, G1a–G4), properties (estimator.md §6 and calculator.md §5, ≥ 500 runs each), staleness (termEnd 2027-01: today 2027-01-31 ok, 2027-02-01 `DATA_STALE`). Delete the scaffold's `tests/engine/smoke.test.ts`.
5. Run `npx vitest run tests/engine` and paste the summary. Commit as `calc-engine: <what> (G-EST: pass)` / `(G-CALC: pass)`.

## Done when
G-EST and G-CALC pass (`docs/ops/gates.md`).

## Forbidden
Rounding inside the math. Hardcoding rates, coefficients or shares in `src/` (they come from JSON). Adding dependencies (numpy isn't pinned: write the normal equations). Mixing the S15 typical line into the estimate.
