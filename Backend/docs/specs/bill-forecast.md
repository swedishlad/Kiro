# Spec · F5 Bill forecast (owners: forecaster for `usage_forecast.json`; calc-engine for the browser math)

## 1. In plain words
Your next six supply bills = how much electricity you'll use × what each kWh will cost. The kWh comes from your home's curve (estimated or from your bills) adjusted by how Massachusetts usage is trending. The price is today's basic-service rate until Jan 31, then our Feb 1 2027 rate forecast. Both halves are tested against history, and each gets its own honest badge.

## 2. Usage forecast → `data/build/usage_forecast.json` (owner: forecaster)
**Data:** `data/build/eia_ma_monthly.csv`, column `sales_mwh` (total MA residential; **not** per customer, whose denominator is noisy).

**Models** (prediction for target month m, made at origin t, horizon h = 1…6):
| Model | Prediction | Notes |
|---|---|---|
| **K0** seasonal-naive | `sales(m − 12)` | Always built; baseline and fallback. Same-month-last-year MAPE ≈ 5.9% (ground truth) |
| **K1** trend-adjusted | `sales(m − 12) × [Σ sales(t−11…t) ÷ Σ sales(t−23…t−12)]` | Uses only data ≤ t |

**Walk-forward backtest:** origins t = 2012-12 … 2026-02 (so t + 6 ≤ 2026-08), all horizons 1–6. Residual e = ln(actual / pred). Strict information set: nothing after t.
- **Leakage test (must pass):** perturb every value after t; forecasts made at t must be bit-identical.
- **Metrics:** `maeLog = mean |e|`; 80% coverage of the model's own band; `vsNaive = MAE(model) ÷ MAE(K0)`; `nMonths` = number of (origin, horizon) pairs scored.

**Bands:** at each origin, the band for calendar month c = empirical P10/P90 of that model's past out-of-sample residuals for calendar month c (pooled across horizons); fewer than 8 → pool all months.

**Ship rule (mechanical; write it into `research/backtest.md` next to the rate forecast):**
```
if MAE(K1) < MAE(K0) and 0.70 <= cov80(K1) <= 0.90:  ship K1, skill = "beats-naive"
else:                                                ship K0, skill = "seasonal-only"
```
**Output `factor`** (12 entries, one per calendar month c), final fit on all data:
- K0: `p50 = 1`; `p10 = exp(q10_c)`, `p90 = exp(q90_c)` from all out-of-sample residuals for month c.
- K1: `p50 = current trend ratio`; `p10/p90 = ratio × exp(q10_c / q90_c)`.
- `infoSetEnd` = last month in the file ("2026-08"). `plainEnglish`: 3–5 lines, with numbers.

## 3. Bill math in the browser: `forecastBills(estimate, usageFc, rates, rateFc, utility, today): BillForecast` (owner: calc-engine, `src/engine/estimate/bill.ts`)
1. **Horizon:** the six calendar months after `today`'s month. On 2026-10-24 that's 2026-11 … 2027-04.
2. **Base kWh** for target month ym (calendar month c) = the estimate's month-c band (collapsed to P50 if `FROM_YOUR_BILLS`).
3. **kWh band** = base.pX × factor[c].pX, matching percentiles.
4. **Rate band:** months ≤ `rates.current[utility].termEnd` ("2027-01") → p10 = p50 = p90 = current cents, `rateSource = "CURRENT_TERM"`. Months in 2027-02 … 2027-07 → `forecast.json.perUtility[utility]` p10/p50/p90, `rateSource = "FORECAST"`. Any month after 2027-07 or before the current term → **fail closed**: that month shows "rate not available" and the total is withheld.
5. **Dollars** = kwh.pX × cents.pX / 100 (supply portion only). **Total** = Σ per percentile. **[call]** Matching percentiles treats the uncertainties as moving together; that's wider (more cautious) than reality, and the drawer says so.
6. `usageSkill` and `rateSkill` copied from the two files for the badges.

**Trim scenario** `trim(bills, pct)`: the two months with the highest kWh P50 in the horizon; `savedDollarsP50 = Σ pct × kwh.p50 × cents.p50 / 100`. Default pct 10%. Months are found from the data, never hard-coded ("winter").

## 3b. D3 household Monte Carlo: `simulateBills(estimate, usageFc, rates, rateFc, utility, today, {nPaths = 5000, seed = 20261024})` (TS, `src/engine/household/simulate.ts`)
Replaces the matching-percentile shortcut of §3 for the UI's fan chart (§3 stays as the deterministic P50 reference).
- Per path: household level `L ~ exp(Normal(residualLog.p50, σ_L))` with σ_L = (p90 − p10) / 2.5631 (if `FROM_YOUR_BILLS`, L = 1); per month usage factor `F_m ~ exp(Normal(ln p50_c, (ln p90_c − ln p10_c)/2.5631))` from usage_forecast.json; one rate draw per path for the forecast term, `R ~ exp(Normal(ln p50, (ln p90 − ln p10)/2.5631))` from forecast.json; current-term months use the current rate.
- `bill_m = base_m × L × F_m × rate_m / 100`; total = Σ months. Quantiles by nearest rank on the sorted paths; `histogram` of the total with 20 equal bins.
- PRNG: mulberry32 seeded; Normal via Box–Muller. Same seed → identical output.
- Tests: zero variance (all bands collapsed) → p50 equals §3's B1/B2 dollars to the cent; ordering p5 ≤ … ≤ p95; reproducibility; with 20,000 paths the mean total is within 2% of the analytic lognormal mean.

## 4. Golden vectors (calc-engine; fixtures from estimator.md §5; round to 2 dp)
Fixtures: usage factor p10/p50/p90 = 0.9 / 1.0 / 1.1 for every month; rates `current.NG = 17.185` through 2027-01; rate forecast NG p10/p50/p90 = 15.0 / 17.0 / 20.0 for 2027-02…07; today = 2026-10-24.

| ID | Case | Expected |
|---|---|---|
| B1 | E1 home (ESTIMATED), NG, month 2026-11 | kWh **214.63 / 434.53 / 788.06**; dollars **36.88 / 74.67 / 135.43**; CURRENT_TERM |
| B2 | E4 home (FROM_YOUR_BILLS), NG, month 2027-02 | base kWh **797.55**; dollars **107.67 / 135.58 / 175.46**; FORECAST |
| B3 | E1 home, NG, six-month total | P50 **517.43** |
| T1 | E1 home, NG, trim 10% | months **2027-01, 2027-02**; saved **19.15** |
| B4 | today = 2027-03-15 (horizon reaches 2027-09) | months after 2027-07 show "rate not available"; total withheld |

## 5. Gates
- **G-FC** (forecaster) now covers both files: leakage tests for M* and K*, both schemas 0 errors, `research/backtest.md` states both ship-rule decisions with numbers.
- **G-EST** (calc-engine) includes B1–B4 and T1.

## 6. Badges (copy-compliance writes the strings; numbers come from the files)
- Usage: "Usage outlook: beat 'same as last year' in N of M past months" (K1) or "Follows last year's seasonal pattern" (K0, `seasonal-only`).
- Rate: as in forecast.md §6.
- Never "accurate", never without `n`.
