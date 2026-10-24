# HMM consumption regimes 🟢⚪🔴: method and test results

Code: `backend/regimes/` (hand-rolled 3-state Gaussian HMM, numpy only). Output: `data/build/regimes.json`. Gate: `python3 tests/backend/regimes/check_regimes.py` (**G-HMM: PASS**). Charts: `docs/img/tests/` (`python3 tests/backend/make_test_charts.py`).

## What the colors mean
Each day's ISO-NE load (all customers, per Massachusetts zone) is compared with what a weather model expects: temperature, weekend and calendar month, fit on the **two years before** that month. The HMM groups the % differences into three states: **green = less than expected (good), grey = about expected, red = more than expected (too much).**

## Why not raw consumption
A first version on raw (GWh) residuals with an expanding window and per-state variances labelled 74–97% of Decembers and Januaries red and 0% of Aprils: it detected the season. The monthly raw-kWh HMM in `src/hmm/` has the same problem (every July red, every April and May green). Fixes, all causal: % residuals (errors scale with load), calendar-month terms, a rolling 2-year window (consumption level drifts), and one shared standard deviation (states differ by level only). Now red appears in every calendar month.

![not seasonal](../docs/img/tests/hmm_not_seasonal.png)

## No look-ahead
Weather model refit monthly on past data only; HMM refit monthly on past residuals (warm start, fresh multi-start each January); the timeline is **forward-filtered**: P(state on day t | data up to t). Test: scramble load after 2020-06-15 and rerun: all 532 earlier days are bit-identical.

![leakage test](../docs/img/tests/hmm_leakage_test.png)

## Results (final fit; shares from filtered states 2019–2023)

| Area | green mean | grey mean | red mean | shared sd | days green / grey / red | avg stretch (days) green / grey / red | state on 2023-12-31 |
|---|---|---|---|---|---|---|---|
| NEMA | -7.1% | -0.8% | +6.3% | 3.4% | 15% / 56% / 29% | 8 / 14 / 5 | grey |
| SEMA | -4.1% | +1.0% | +8.4% | 3.5% | 19% / 65% / 16% | 10 / 11 / 5 | grey |
| WCMA | -5.9% | +0.0% | +5.0% | 3.6% | 33% / 50% / 17% | 11 / 13 / 11 | green |
| MA | -5.8% | -0.5% | +5.5% | 3.1% | 12% / 61% / 27% | 7 / 9 / 4 | grey |

![timeline](../docs/img/tests/hmm_states_timeline.png)

## Limits
- ISO-NE files stop at 2023-12-31, so 'current' is that day. Load is all customer classes, not households.
- MA = three zones summed; zone boundaries for towns are approximate (by county).
- The red state is somewhat more frequent in summer (heat waves the temperature terms miss) but never dominates a month (max 45%, NEMA).
