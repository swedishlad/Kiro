# Backend Forecast Plan — Monte Carlo 6-month + All-Cities (Python, backend-only)

Owner prefix: all new files use `forecast_mc_*` / `allcities_*` (tests too). Do NOT touch sibling
workflows' files (`stats_*`, `savings_*`, `map_*`, `hmm_*`), nor `contracts/`, `.kiro/hooks/`,
`scaffold/`, `package.json`, `data/build/towns*`. Outputs commit to `data/build/forecast_mc.json`
and `data/build/allcities_forecast.json`.

## 0. Exploration findings (verified on the snapshot this session)

- **Baseline reproduced:** same-month-last-year (seasonal-naive, h=12) MAPE on `sales_mwh` =
  **5.95%** (n=188); on `kwh_per_customer` = **6.01%** (n=188). Last-month-naive = 12.98%.
  Matches ground-truth (~5.9% sales / 6.0% per-customer). This is the number the backtest must land near.
- **Error model for the Monte Carlo:** log-residual `e = ln(actual / same-month-last-year-pred)` on
  the EIA series. Pooled across all months: n=188, mean ≈ -0.0008 (≈ unbiased), sd ≈ 0.0733,
  exp(P10/P50/P90) ≈ 0.911 / 1.000 / 1.096. Per calendar month there are 15–16 residuals each
  (>= the 8-residual threshold the repo's forecast specs use), so **per-calendar-month empirical
  residual quantiles are viable** and preferred over a single pooled band. The distribution is
  near-symmetric and near-lognormal; bootstrap of empirical residuals is chosen over a fitted normal
  so the real winter/summer fat tails (e.g. Aug exp(P90)=1.135) survive.
- **Seasonal shape** (sales share by calendar month, mean 2019–2025) reproduced exactly:
  Jan .094 Feb .0867 Mar .0802 Apr .0716 May .0685 Jun .0783 Jul .1044 Aug .1044 Sep .0851
  Oct .0708 Nov .0701 Dec .0857. Peak/trough ~1.5; **summer peaks ~ January, so never hard-code
  "winter"** (agent-rules #, ground-truth).
- **Horizon** (forecast pivot = the Feb 1 2027 reset, "next six months"): info set ends at the last
  EIA month **2026-08**; the six forecast months are **2026-11, 2026-12, 2027-01, 2027-02, 2027-03,
  2027-04** — matching `bill-forecast.md` §3 (2026-11 … 2027-04). This window straddles the Feb 1 2027
  reset (months 4–6 are post-reset). The MC forecasts **consumption (kWh)**, not price; the reset is
  the labeling pivot, not a kWh event.
- **No town-level usage data exists.** RECS 2020 (552 MA households) is survey microdata with NO
  town/geo column; EIA-861M is MA **state-total** only. The 351-town list lives in `towns.json`
  (geo-map's output, built from the LMEC GeoJSON) which carries only geometry + `geoid`, **no
  population / customer count / usage**. Therefore **every town forecast is the state per-customer
  seasonal path**; there is no in-repo per-town signal to differentiate towns. This MUST be labeled
  honestly (agent-rules #1, #11): the all-cities output is "state-shaped, not town-measured".
- **Town list source:** canonical 351 towns = `massgis_town_id` 1..351 with `massgis_name` (upper,
  join key) and `census_name` (display) and `GEOID` (`25` + 8 digits). The LMEC GeoJSON
  (`https://raw.githubusercontent.com/nblmc/massachusetts-municipal-boundaries/main/data-cooked/mass-municipalities.geojson`,
  18 MB) is reachable and yields all 351 names. `data/build/towns.json` does NOT exist yet and
  `node_modules` is absent, so the all-cities module must NOT depend on geo-map's artifact: it reads
  `data/build/towns.json` IF present, else fetches the GeoJSON once at build time (allowed build-time
  download) and caches the extracted name list to `data/build/allcities_towns_cache.json` (an
  `allcities_`-prefixed file I own). It never writes `data/raw/**` or `data/build/towns*`.
- **Environment:** Python 3.13 (miniconda); numpy 2.2.5, scipy 1.15.3, pandas 2.3.3, pytest 9.0.3,
  openpyxl 3.1.5 all present. No new deps needed. Tests run with `python3 -m pytest`.
- **Git:** the working tree is the parent `Trading Folder` repo (branch `feat/option-dashboard`) with
  many unrelated uncommitted changes. The `guard-git` hook blocks `git add -A` / `git add .` /
  checkout / reset. Stage ONLY new files by name. Commit subjects should carry an agent prefix
  (e.g. `forecaster-mc: ...`) per the repo's commit-ownership convention; commit, never push.

## 1. Shared design decisions (made here, not left open)

- **Point model = seasonal-naive (K0 analogue):** P50 path = same-month-last-year per-customer value.
  Rationale: it is the verified 5.95% baseline and the repo's documented fallback; a trend-adjusted
  K1 is out of scope for the MC (the MC's job is the *distribution*, not beating the baseline).
- **Uncertainty = bootstrap of empirical log-residuals, per calendar month**, back-transformed
  (`path = baseline * exp(residual_draw)`). Rationale: preserves observed month-specific spread and
  fat tails; deterministic and simple. Pooled-month residuals are the documented fallback when a month
  has < 8 residuals (not the case here, but coded for safety).
- **Deterministic RNG:** `numpy.random.default_rng(seed)` with a fixed default seed **20270201**
  (the reset date as an int) and `n_sims = 10000`. Same seed + same input CSV ⇒ byte-identical JSON.
- **Quantiles emitted:** P10/P50/P90 (the fan band) plus a full quantile grid
  `[1,5,10,25,50,75,90,95,99]` per month. **Invariant enforced in every record:** P10 ≤ P50 ≤ P90
  (and the full grid is monotone nondecreasing) — asserted at build time and in tests.
- **Units:** per-customer kWh/month (the stable denominator; ground-truth warns raw customer counts
  are noisy, so the baseline uses the published `kwh_per_customer` column which the ingest derived as
  `sales*1000/customers`). The JSON states `"unit": "kwh_per_customer_month"` explicitly.
- **Pure/importable functions:** all math in importable functions (no side effects at import); a thin
  `main()` / `if __name__ == "__main__"` writes the JSON. Tests import the functions directly.

## 2. JSON output shapes (exact)

### `data/build/forecast_mc.json`
```json
{
  "asOf": "2026-10-24",
  "infoSetEnd": "2026-08",
  "method": "seasonal-naive baseline + per-calendar-month bootstrap of log-residuals",
  "unit": "kwh_per_customer_month",
  "seed": 20270201,
  "nSims": 10000,
  "horizon": ["2026-11","2026-12","2027-01","2027-02","2027-03","2027-04"],
  "resetMonth": "2027-02",
  "baselineMape": { "sales": 5.95, "perCustomer": 6.01, "n": 188 },
  "months": [
    {
      "month": "2026-11",
      "calendarMonth": 11,
      "baseline": 483.7,
      "postReset": false,
      "p10": 445.5, "p50": 481.2, "p90": 514.5,
      "quantiles": { "1": 0.0, "5": 0.0, "10": 445.5, "25": 0.0,
                     "50": 481.2, "75": 0.0, "90": 514.5, "95": 0.0, "99": 0.0 },
      "residualN": 15
    }
    // ... 6 month entries, months 4-6 have postReset: true
  ],
  "plainEnglish": "string, >=40 chars, with numbers, honest labeling"
}
```
Band invariant: for every month entry `p10 <= p50 <= p90`, and `quantiles` keys are monotone
nondecreasing in value.

### `data/build/allcities_forecast.json`
```json
{
  "asOf": "2026-10-24",
  "infoSetEnd": "2026-08",
  "method": "state per-customer seasonal-naive path applied to every MA town (state-shaped)",
  "unit": "kwh_per_customer_month",
  "seed": 20270201,
  "horizon": ["2026-11","2026-12","2027-01","2027-02","2027-03","2027-04"],
  "resetMonth": "2027-02",
  "townListSource": "towns.json | LMEC-geojson-fetch",
  "townCount": 351,
  "droppedTowns": [],
  "thinHistoryNote": "No town-level usage history exists in-repo (RECS has no town field; EIA is MA state-total). Every town uses the shared state per-customer path. Forecasts are state-shaped, not town-measured.",
  "towns": [
    {
      "id": 1,
      "name": "AQUINNAH",
      "census": "Aquinnah",
      "geoid": "2500100000",
      "scaling": "state-shaped",
      "thinHistory": true,
      "months": [
        { "month": "2026-11", "p50": 481.2, "p10": 445.5, "p90": 514.5, "postReset": false }
        // ... 6 months; p10/p90 present because the state band supports it
      ]
    }
    // ... 351 towns
  ],
  "plainEnglish": "string, >=40 chars, honest labeling"
}
```
Band invariant: for every town, every month entry `p10 <= p50 <= p90`. `thinHistory: true` on every
town (honest: none have measured town-level history). `droppedTowns` lists any town the source set
could not supply (expected empty; if the fetch yields != 351, flag it, never silently pad).

## 3. Implementation plan (ordered, each item leaves the tree buildable)

- [ ] 1. Create the shared forecast core module `forecast_mc_core.py` (repo root of `fairwatt-kit`).
      Pure functions: `load_eia(path) -> rows`; `per_customer_series(rows) -> dict[(y,m)->float]`;
      `baseline_mape(series_sales, series_pc) -> {"sales","perCustomer","n"}` (reproduces 5.95%/6.01%);
      `log_residuals_by_month(pc_series) -> dict[1..12, list[float]]`; `horizon(info_end=(2026,8), k=6)
      -> list[(y,m)]`; `seasonal_naive_baseline(pc_series, horizon) -> dict[(y,m)->float]`. No I/O at
      import.
      Files: `fairwatt-kit/forecast_mc_core.py`
      Verify: `cd fairwatt-kit && python3 -m pytest forecast_mc_test.py -k core` passes (after item 3),
      and `python3 -c "import forecast_mc_core as c; print(c.baseline_mape(*c._load_series('data/snapshot/eia_ma_monthly_2026-08.csv')))"`
      prints sales≈5.95, perCustomer≈6.01, n=188.

- [ ] 2. Create the Monte Carlo engine + writer `forecast_mc_build.py`.
      Functions: `simulate_month(baseline, residuals, rng, n_sims) -> np.ndarray`;
      `quantile_record(sim, calendar_month, ym, baseline, post_reset) -> dict` (fills p10/p50/p90 +
      the 9-point grid, asserts monotonicity); `build_forecast_mc(eia_path, seed=20270201,
      n_sims=10000) -> dict` (assembles the full object incl. `baselineMape`, `plainEnglish`);
      `main()` writes `data/build/forecast_mc.json`. Imports `forecast_mc_core`. Reset flag:
      `post_reset = (y,m) >= (2027,2)`.
      Files: `fairwatt-kit/forecast_mc_build.py`
      Verify: `cd fairwatt-kit && python3 forecast_mc_build.py && python3 -c "import json;d=json.load(open('data/build/forecast_mc.json'));assert len(d['months'])==6;assert all(m['p10']<=m['p50']<=m['p90'] for m in d['months']);print('ok',d['baselineMape'])"`.

- [ ] 3. Create `forecast_mc_test.py` (pytest). Cases: (a) baseline MAPE within [5.5, 6.5]% on both
      series and n==188; (b) determinism — two `build_forecast_mc(... seed=20270201)` runs produce
      identical dicts (and identical JSON bytes); (c) band ordering p10<=p50<=p90 and monotone 9-point
      grid in every month; (d) horizon == the 6 expected months with correct `postReset` flags and
      `resetMonth=="2027-02"`; (e) forecast_mc.json parses and matches the built dict.
      Files: `fairwatt-kit/forecast_mc_test.py`
      Verify: `cd fairwatt-kit && python3 -m pytest forecast_mc_test.py -q` — all pass.

- [ ] 4. Create the town-list provider `allcities_towns.py`.
      `load_town_list(build_dir, fetch_ok=True) -> (list[{id,name,census,geoid}], source_str,
      dropped:list)`: read `data/build/towns.json` if present; else fetch the LMEC GeoJSON once, extract
      the 351 (id, massgis_name, census_name, GEOID), cache to
      `data/build/allcities_towns_cache.json`. Validate count==351; if not, return the shortfall in
      `dropped` and set source accordingly. Never writes `data/raw/**` or `data/build/towns*`. Network
      failure with no cache and no towns.json → raise a clear error (fail closed), not a silent partial.
      Files: `fairwatt-kit/allcities_towns.py`
      Verify: `cd fairwatt-kit && python3 -c "import allcities_towns as t; ts,src,dropped=t.load_town_list('data/build'); print(len(ts), src, dropped[:3])"` prints `351 ...  []`.

- [ ] 5. Create the all-cities builder `allcities_build.py`.
      `build_allcities(eia_path, build_dir, seed=20270201) -> dict`: compute the shared state
      per-customer seasonal path + band once (via `forecast_mc_core` and the MC bands from item 2 at
      P50/P10/P90 only), then map it onto every town from item 4 with `scaling:"state-shaped"`,
      `thinHistory:true`; assemble `townCount`, `droppedTowns`, `thinHistoryNote`, `plainEnglish`.
      `main()` writes `data/build/allcities_forecast.json`. Enforce p10<=p50<=p90 per town-month.
      Files: `fairwatt-kit/allcities_build.py`
      Verify: `cd fairwatt-kit && python3 allcities_build.py && python3 -c "import json;d=json.load(open('data/build/allcities_forecast.json'));assert d['townCount']==351;assert len(d['towns'])==351;assert all(mm['p10']<=mm['p50']<=mm['p90'] for t in d['towns'] for mm in t['months']);print('ok dropped=',d['droppedTowns'])"`.

- [ ] 6. Create `allcities_test.py` (pytest). Cases: (a) full coverage — exactly 351 towns, ids 1..351
      unique, `droppedTowns==[]` (or, if the source truly dropped towns, every missing id is listed and
      count+dropped reconcile to 351); (b) every town has 6 months with p10<=p50<=p90 and correct
      `postReset`; (c) every town flagged `thinHistory:true` and `scaling:"state-shaped"` (honest
      labeling); (d) determinism under fixed seed; (e) allcities_forecast.json parses; (f) town P50
      path equals the shared state path (towns are not independently perturbed).
      Files: `fairwatt-kit/allcities_test.py`
      Verify: `cd fairwatt-kit && python3 -m pytest allcities_test.py -q` — all pass.

- [ ] 7. Integration verification + commit. Run both builders, then
      `cd fairwatt-kit && python3 -m pytest forecast_mc_test.py allcities_test.py -q` (all pass) and
      confirm both JSON files parse. Stage ONLY the new files by name
      (`git add fairwatt-kit/forecast_mc_core.py forecast_mc_build.py forecast_mc_test.py allcities_towns.py allcities_build.py allcities_test.py data/build/forecast_mc.json data/build/allcities_forecast.json data/build/allcities_towns_cache.json research/backend-forecast-plan.md`),
      commit `forecaster-mc: MC 6-month + all-cities forecasts`. NEVER `git add -A/.`; never push.
      Verify: `git status --porcelain` shows only the intended new files staged; pytest output clean.

## 4. Test plan summary (maps to the required checks)

- **Reproducibility under fixed seed:** items 3(b), 6(d) — identical dicts/bytes across runs.
- **Band ordering everywhere:** items 3(c), 6(b) — p10<=p50<=p90 in every MC month and every
  town-month, plus monotone 9-point grid in the MC file.
- **Full town-set coverage with dropped-town flagging:** item 6(a) — 351 unique ids, `droppedTowns`
  reconciles.
- **Held-out backtest MAPE near ~5.9%:** items 1 + 3(a) — measured 5.95% sales / 6.01% per-customer
  asserted within [5.5, 6.5]%.
- **Both JSON files parse:** items 3(e), 6(e).
- **Honest labeling:** item 6(c) — thinHistory/state-shaped on every town; `thinHistoryNote` present.

## 5. Gaps / assumptions (noted, not blocking)

- No per-town usage or population signal exists in-repo; the all-cities forecast is deliberately
  state-shaped and labeled so. If a town→customer-count table is later added, `scaling` can switch to
  a weighted per-town path without changing the JSON shape.
- The MC forecasts consumption only; dollar/bill math and the rate forecast are other agents' files
  (calc-engine, forecaster) and are out of scope here.
- `asOf` is set to the build date (2026-10-24 per repo "today"); if the build runs later the date
  updates — this does not affect the deterministic numeric outputs, which depend only on the EIA CSV.
