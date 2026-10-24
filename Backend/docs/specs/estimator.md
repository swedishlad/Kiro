# Spec · F4 Estimate + refine (owner: calc-engine)

## 1. In plain words (the version you say to judges)
We can't see your meter, and nobody can look it up from your address. So we ask four things about your home: size, age, type, and how you heat it. The federal government surveyed 552 Massachusetts homes in 2020 and measured their electricity; we find what homes like yours used. State data for 16 years tells us how that usage spreads over the year, with peaks in **July–August and January**. If you type the kWh from your bills, we switch to your numbers.

The band matters more than the point. Homes that look alike on paper use very different amounts (the fit explains about a third of the variation), so the range is wide, and we say so.

## 2. Inputs and outputs
- **In:** `HomeInput` (contracts/types.ts): `sqft`, `yearBuilt` (1–9), `housing`, `heat`, `userMonths` (0–12), plus `EstimateModelFile`.
- **Out:** `EstimateOutcome` → `UsageEstimate`: `label`, `annualKwh` band, 12 `monthly` bands, `typicalMonthly` (comparison line only).

## 3. Build-time fit → `data/build/estimate_model.json`
Code lives in `src/engine/estimate/` (Python build script or TS). Input: `data/build/recs_ma.csv` (552 rows, G-DATA-3).

**Features** (from RECS columns; UI mapping in brackets):
| Feature | Definition | UI mapping |
|---|---|---|
| `logSqft` | ln(`TOTSQFT_EN`) | sq ft slider |
| `electricHeat` | 1 if `FUELHEAT == 5` | `heat == "ELECTRIC"` |
| `apartment` | 1 if `TYPEHUQ ∈ {4, 5}` | `housing ∈ {APT_2_4, APT_5_PLUS}`; MOBILE, SF_* → 0 |
| `yearBuiltRange` | `YEARMADERANGE` as a number 1–9 | `yearBuilt` |

**Candidates** (fit both, choose by leave-one-out, write both into `research/estimator.md`):
- **(a) LOGLINEAR:** weighted least squares (weights `NWEIGHT`) of ln(`KWH`) on `1, logSqft, electricHeat, apartment`, and `yearBuiltRange` only if it lowers the LOO error. Pure Python normal equations are fine (4–5 unknowns); numpy is not in the pinned set.
  - Sanity anchor (ground-truth.md): without `yearBuiltRange` the full-sample coefficients are ≈ 5.302 / 0.469 / +0.420 / −0.326, weighted R² ≈ 0.34. A result far from this means a bug.
- **(b) CELL_MEDIAN:** cells `"<sqft bucket>|ELECTRIC or NONELECTRIC|HOUSE or APARTMENT"` (buckets < 1000, 1000–1999, 2000–2999, 3000+); value = `NWEIGHT`-weighted median `KWH`. If a cell has `n < 15`, replace a key part with `*` (pool), first housing type, then heat; record pooled cells explicitly.

**Leave-one-out (LOO):** for each of the 552 homes, refit without it, predict it, record r = ln(actual / pred).
- `residualLog` = unweighted P10 / P50 / P90 of r, with `n`.
- `looMedianAbsPctError` = median of |exp(−r) − 1|.
- **Choose** the candidate with the lower `looMedianAbsPctError`. Ties → LOGLINEAR.

**Shares:** recompute the 12 calendar-month shares from `data/build/eia_ma_monthly.csv` exactly as `reference/verify_usage.py` does (total sales, mean over calendar years 2019–2025). Assert that the 4-dp values equal ground-truth.md, then **store them at full precision, normalized to sum to exactly 1**.

**Typical line:** calendar 2025 kWh per account = monthly sales × 1000 ÷ the 12-month trailing mean of customers. Assert the rounded values equal ground-truth.md (687 … 667; 7,135/yr).

**Limits:** `sqftMin 200`, `sqftMax 15000`, `userKwhMin 50`, `userKwhMax 5000`.

## 4. Browser evaluation: `estimate(home, model): EstimateOutcome` (pure, in `src/engine/estimate/estimate.ts`)
1. **Validate:** sqft outside [200, 15000] → `SQFT_OUT_OF_RANGE`; any typed kWh outside [50, 5000] → `USER_KWH_OUT_OF_RANGE`; repeated month → `DUPLICATE_MONTH`. These are hard errors: no estimate, say why.
2. **Annual P50:** LOGLINEAR → `exp(intercept + Σ coef · feature)`; CELL_MEDIAN → the matching cell (most specific key first).
3. **Band:** `annual.pX = P50 × exp(residualLog.pX)`.
4. **Monthly:** `monthly[m].kwh.pX = annual.pX × shares[m]` for all three percentiles.
5. **Refine** (`userMonths`):
   - 0 months → `label = "ESTIMATED"`.
   - 1–2 months → still `ESTIMATED`, warning `TOO_FEW_MONTHS`; the UI shows the typed points on the chart but doesn't rescale.
   - 3–11 months → `k = mean(typed kWh) ÷ mean(estimated P50 for those same months)`; every monthly and annual value × k; **band collapses to the P50** (p10 = p50 = p90); `label = "FROM_YOUR_BILLS"`. Untyped months keep the shape.
   - 12 months → use the typed values as the curve (point values); annual = their sum; `label = "FROM_YOUR_BILLS"`.
6. `typicalMonthly` = `model.typical.kwhByMonth`, untouched.

**[call]** Collapsing the band after refine is a simplification. The estimate's uncertainty is about *which home* you are, and typed bills answer that. Future-month uncertainty is carried by the usage forecast (bill-forecast.md).

## 5. Golden vectors (fixture model; must pass after rounding to 2 dp)
Fixture: `model = "LOGLINEAR"`, `intercept = 5.302`, `coef = { logSqft: 0.469, electricHeat: 0.420, apartment: -0.326 }`, `residualLog = { p10: -0.6, p50: 0, p90: 0.5, n: 552 }`, `shares` = the ground-truth 4-dp shares **normalized** (each ÷ 0.9998).

| ID | Input | Expected |
|---|---|---|
| E1 | 1500 sq ft, GAS, SF_DETACHED, no months | annual P50 **6197.49**, P10 **3401.26**, P90 **10217.94**; Jan P50 **582.68**; Jul P50 **647.15**; label ESTIMATED |
| E2 | 1500 sq ft, ELECTRIC, SF_DETACHED | annual P50 **9432.35** |
| E3 | 800 sq ft, GAS, APT_5_PLUS | annual P50 **3331.18** |
| E4 | E1 + typed Jan 900, Feb 800, Mar 700 | k **1.484001**; annual **9197.09**; Jul **960.37**; band collapsed; label FROM_YOUR_BILLS |
| E5 | sqft 150 | error `SQFT_OUT_OF_RANGE`, no numbers |
| E6 | typed Jan 40 | error `USER_KWH_OUT_OF_RANGE` (month 1) |

## 6. Property tests (fast-check, ≥ 500 runs each)
1. Σ monthly P50 = annual P50 (within 1e-9 relative).
2. P10 ≤ P50 ≤ P90 for annual and every month.
3. LOGLINEAR with `coef.logSqft > 0`: larger sqft → larger annual P50 (others fixed).
4. Scaling: multiplying every typed month by c > 0 multiplies annual by c (3–11 months).
5. 12 typed months return exactly those values.
6. No NaN or Infinity anywhere over the valid input grid.

## 7. Gate G-EST
`npx vitest run tests/engine` (goldens E1–E6 by name, properties 1–6) **and** the build script's own asserts (shares and typical match ground truth) **and** `estimate_model.json` validates against `contracts/estimate_model.schema.json` (0 errors) **and** `research/estimator.md` has both candidates' LOO numbers and the choice.

## 8. Non-goals
Heat pumps, AC, EVs, solar, household size (all in RECS; v2 if time); any per-town adjustment (no verified source); mixing the S15 typical line into the estimate.
