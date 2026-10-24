# Spec · D4 HMM consumption regimes 🟢⚪🔴 (owner: regime-model) → `data/build/regimes.json`

**Superseded by TC's definition (Oct 24, 11:25):** red = above the historical average range, grey = within, green = below; range = average ± 1 sd of the same period in the previous 5 years (prior years only). Implementation, tests and results: `backend/regimes/build.py`, `tests/backend/regimes/check_regimes.py`, `research/regimes.md`. Contract: `RegimesFile` v2.1.0.

The text below is the earlier weather-adjusted design, kept for the record.


Code: `backend/regimes/build.py` (Python + numpy; **hand-rolled** Baum–Welch and forward filter; hmmlearn is not installed). Contract: `RegimesFile`, `contracts/regimes.schema.json`.

## 1. In plain words
Weather explains 80–87% of daily electricity use in each Massachusetts zone. What's left over (the residual) clusters into stretches of "using less than the weather explains", "about normal" and "using more than the weather explains". A 3-state Hidden Markov Model finds those stretches. **Green = good, grey = mid, red = too much**, always relative to the weather.

## 2. Series (no look-ahead: this is the rule that matters)
- Per area (NEMA, SEMA, WCMA, MA as in stats.md): residual `r_t = (GWh_t − expected_t) / expected_t × 100`, with expected from GWh ~ 1 + HDD + CDD + weekend + HDD²/100 + CDD²/100 + 11 calendar-month terms.
- **The weather model is fit walk-forward on a rolling 2-year window:** for each month M from 2018-01, fit on the 730 days before M and predict the days in M. 2017 is burn-in only. Never fit on the full sample for anything that is shown as a regime.
- **Why percent, month terms, a rolling window and tied variance (found Oct 24):** with raw GWh residuals, an expanding window and per-state variances, the "red" state was 74–97% of Decembers and Januaries and 0% of Aprils (errors scale with load, and the expanding model drifts as consumption falls). With these four choices red appears in every calendar month (14–45%), so the colors describe behaviour, not the season.

## 3. HMM
- 3-state Gaussian HMM on `r_t` (1-D), **one shared standard deviation** (tied), so states differ only by level. Baum–Welch from 10 seeded initializations (seed 20261024 + i), keep the best log-likelihood; tolerance 1e-6, ≤ 500 iterations.
- **Order states by mean**, ascending → green, grey, red (fixes label switching after every refit).
- **Walk-forward filtering:** refit the HMM at the start of every month on residuals before that month (expanding window, burn-in 2018 → first output 2019-01-01), then run the **forward filter** through the month with those parameters. `timeline` and `monthly` come only from these filtered probabilities P(state_t | r_1..r_t).
- `current` = filtered probabilities on the **last data day (2023-12-31)**; the UI shows that date.
- `transition`, `states` (means, sds, `expectedDurationDays` = 1/(1 − p_stay), `shareOfDays` from filtered argmax) come from the final fit.
- `outlook` = `current.probs` × T^k for k = 7, 30, 90.
- A full-sample smoothed (Viterbi) path may appear **only** in `research/regimes.md`, labeled "hindsight, repaints".

## 4. Tests (gate G-HMM: `python3 tests/backend/regimes/check_regimes.py`)
1. **Leakage:** perturb every residual after a random day t (seeded); filtered probabilities up to t must be bit-identical. Also perturb raw load after t: walk-forward residuals up to t identical.
2. Means strictly increasing green < grey < red; each state ≥ 5% of filtered days; transition rows sum to 1 (1e-9).
3. Forward-filter correctness on a 2-state toy series with a hand-computed answer (3 days).
4. Schema 0 errors; `leakageTest: "pass"` is written only if test 1 passed in the same run.
5. `research/regimes.md`: per area the three state means/sds, transition matrix, share of days, notable red/green stretches with dates (for example, 2020 spring), and the log-likelihood vs a 2- and 4-state fit (information only: TC chose 3 states).
