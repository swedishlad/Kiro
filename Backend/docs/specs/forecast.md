# Spec · F2 Forecast of the Feb 1 2027 reset (owner: forecaster)

## 1. In plain words (the version you say to judges)
Twice a year, each utility resets its default price. We want to say, before it happens, *roughly* where the Feb 1 2027 price will land, and **how sure we are**.

The trick we found in 22 years of state data:
- The fixed price for a six-month period is almost exactly the **average of that period's monthly prices**, about +0.9% on top.
- So instead of guessing one number out of thin air, we forecast six monthly prices (which have a strong winter/summer pattern) and average them.

Then we test the method honestly: we pretend it's 2010, 2011, … and check every past forecast against what actually happened. If our method can't beat "the price stays the same", we **say so on screen**.

## 2. Target
- **What:** the residential fixed basic-service rate for the term **2027-02 … 2027-07**, for each of NG, EV_EAST, EV_WEST and UNITIL.
- **Output:** P10 / P50 / P90 in ¢/kWh, plus the model used, skill status, backtest table, and a plain-English paragraph (`ForecastFile` in contracts).
- **Freeze:** `asOf` = the day you freeze. Commit `forecast.json` with that date. This is the pre-registration that gets scored when the real rate is published (expected roughly early-to-mid January; the timing is [U]).

## 3. Evidence already in hand (from `reference/h1_precheck.py` on the snapshot, Oct 23)
**H1, fixed ≈ mean(monthly prices in the term) × (1+δ).** Terms ending 2010-01 or later:

| Utility | n | median δ | mean δ | sd | min | max |
|---|---|---|---|---|---|---|
| NG | 35 | +0.92% | +0.75% | 1.13 | −3.00% | +3.33% |
| NSTAR | 35 | +0.78% | +0.88% | 2.92 | −13.41% | +6.12% |
| WMECo | 35 | +1.39% | +1.03% | 3.42 | −17.08% | +6.49% |
| Unitil | 35 | +0.95% | +0.93% | 3.01 | −14.02% | +5.94% |
| **All** | **140** | **+0.92%** | **+0.90%** | — | — | — |

- **86% of the 140 terms are within ±3%.**
- The large misses are **1-month transition terms** (NSTAR/WMECo 2018-01, Unitil 2022-12) and a few winter terms. A plausible but **unverified** explanation is that the fixed rate is load-weighted, not a simple mean: winter months carry more kWh and price. Test a load-weighting proxy only if time allows.
- This is **in-sample and descriptive**. It does not by itself prove forecast skill.

**How big is a reset?** Simple % change of the fixed rate from one term to the next (new ÷ old − 1), terms ending 2010-01 or later:

| Utility | n | median | p10 | p90 | mean \|change\| |
|---|---|---|---|---|---|
| NG | 35 | −0.3% | −29.2% | +40.8% | 27.4% |
| NSTAR | 35 | +5.0% | −21.1% | +25.7% | 16.4% |
| WMECo | 35 | +1.4% | −22.7% | +22.5% | 15.8% |
| Unitil | 35 | +0.8% | −23.8% | +26.3% | 18.6% |

Models work in log changes; the script prints mean |log change| too (NG 24.9, NSTAR 16.0, WMECo 15.4, Unitil 17.9, in log-points × 100).
So the honest no-skill band (M0) is very wide: roughly −21% to −29% on the downside (p10) and +22% to +41% on the upside (p90). Much of that swing is **seasonal**: winter-heavy vs summer-heavy terms, and the pre-2024 calendars put whole winters into one term. That's why M1 and M2 have a real chance to beat M0, but that is a hypothesis until the backtest says so.

## 4. Models (build in this order; stop when time runs out)

| Model | Prediction for next term T+1 | Notes |
|---|---|---|
| **M0** naive | fixed(T) | Band = empirical quantiles of past log changes (pooled or per utility). Always built: it's the baseline and the fallback |
| **M1** seasonal-level | mean of the monthly prices for the **same calendar months one year earlier** × [mean monthly price over the last 12 known months ÷ the same 12 months a year earlier] × (1+δ̂) | Calendar-safe because it works on months, not term labels |
| **M2** monthly path | Forecast each month of T+1 as level × seasonal factor (factor for calendar month m = median over the past N years of log price(m) − that year's mean log price), then average × (1+δ̂) | N = 5–8 years. No exotic models. In our own earlier PeakCall simulation (an internal experiment, not a published source), a regime layer added ≈0 over a plain baseline |

δ̂ = median δ over terms that ended **before** the cut (walk-forward). Never use the full-sample +0.92%.

## 5. Walk-forward backtest

**Cuts:** every term T+1 that ends between 2012-01 and 2026-07, all four utilities.

**Information set:** report BOTH versions and label which one the UI uses:
- **IS-A (strict):** monthly prices for months strictly before the forecast date. Forecast date = 3 months before T+1 starts, which mirrors Oct 2026 → Feb 2027.
- **IS-B (as-published):** all monthly prices through the end of term T. That's the situation today: Jan 2027 prices were already published in Jul 2026. It assumes in-term months were published in advance historically too, which is **[U]** for older years.

**Leakage test (must pass):** randomly perturb all monthly prices after the information-set end and re-run. Forecasts must be bit-identical.

**Metrics** (log scale; y = log actual, ŷ = log prediction):
- `MAE = mean |y − ŷ|`
- 80% coverage: share of actuals with `p10 ≤ actual ≤ p90`
- Pinball at q ∈ {0.1, 0.5, 0.9}: `L_q = mean(max(q·(y−ŷ_q), (q−1)·(y−ŷ_q)))`
- `vsNaive = MAE(model) / MAE(M0)`

**Intervals:** P10/P90 come from empirical quantiles of the model's own **past out-of-sample residuals** (log scale) available at each cut. If fewer than 8 residuals exist for a utility, use the pooled residuals.

## 6. Ship rule (applied mechanically; record it in `research/backtest.md`)
```
best = argmin over {M1, M2} of pooled MAE   # all metrics in this rule use IS-A (strict)
if MAE(best) < MAE(M0)  and  0.70 <= cov80(best) <= 0.90:
     ship best, skill = "beats-naive"
else:
     ship M0, skill = "no-skill"   (UI label: "No reliable forecast. Here's how big resets usually are")
```

**Which backtest the UI shows:** the badge always reports the **IS-A** result (conservative). The final forecast itself uses all published data (IS-B, because Jan 2027 prices are already published). `research/backtest.md` reports both; the drawer can show the IS-B numbers labeled "assumes advance publication".

**Sample-size honesty:** 30 cuts per utility (terms ending 2012-01 … 2026-07) with autocorrelated errors. The UI badge shows `n` and never says "accurate". It says "beat the no-change guess in N of M past resets", with real numbers.

## 7. Deliverables
1. `src/engine/forecast/`: pure TS, or a Python build script placed inside that folder. Either is fine, because the output is static JSON.
2. `data/build/forecast.json` (validates against `contracts/forecast.schema.json`).
3. `research/backtest.md`: the table of all models × utilities × both info sets, the ship-rule decision, the leakage-test result, and a 5-line plain-English summary.
4. `tests/forecast/`: the leakage test, the "M0 equals last value" test, and a schema test.
