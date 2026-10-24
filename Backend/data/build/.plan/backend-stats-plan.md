# Implementation Plan — FairWatt backend calculation module (stats / savings / map)

Owner of this plan: the backend-stats workflow. Scope is **Python backend only** — no UI/TS/React.
All paths below are absolute. Work directly in the tree at
`/Users/lukecha/Library/Mobile Documents/com~apple~CloudDocs/Trading Folder/fairwatt-kit`.

## Chosen tooling and layout (decisions)

- **Python 3.13.5** (the repo's interpreter; confirmed `python3 --version`). `numpy 2.2.5`, `pandas 2.3.3`,
  `pytest 9.0.3`, `openpyxl 3.1.5` are already installed — no new dependencies, satisfying agent-rule #8.
  Decision: use **numpy/pandas** for the stats math (concise, already present); keep every public function
  pure and importable so an API can wrap it later.
- **New package `src/backend/`** rather than adding to `reference/`. Rationale: `reference/**` is declared
  *frozen, orchestrator-owned* in `.kiro/steering/structure.md`; the two sibling workflows also create new
  modules (`reference/hmm_*`, `forecast_mc_*`). To keep ownership clean and avoid touching frozen files, this
  workflow puts its code under a fresh `src/backend/` tree and stays strictly within **stats / savings / map**
  filenames. This does not collide with the HMM workflow (`hmm*`) or the Monte-Carlo/all-cities workflow
  (`forecast_mc_*`, `allcities_*`).
- **Tests** in `/Users/.../fairwatt-kit/tests/backend/` (pytest). No pytest config exists; pytest discovers
  `tests/backend/test_*.py` by default. Run from the repo root.
- **Artifacts** committed under `/Users/.../fairwatt-kit/data/build/` (create the dir; it does not yet exist):
  `consumption_stats.json`, `savings_model.json`, `map_consumption.json`.
- **Contract doc** for the frontend teammate: `/Users/.../fairwatt-kit/research/backend-stats.md`
  (NOTE: `research/` has several orchestrator-owned files, but this is a *new* filename not in the ownership
  table; if G-OWN flags it, move it to `docs/research/backend-stats.md` or return a REQUEST — recorded as an
  open risk, not a blocker).
- **Honesty rules carried through** (agent-rules #1, #11; calculator.md §2): dollars are the **supply portion
  only**; every kWh not typed by a user is "estimated for a home like yours"; no invented numbers — every
  constant traces to `.kiro/steering/ground-truth.md` or to code run on `data/snapshot/`.
- **Git:** stage only new files by name; never `git add -A`, `checkout`, or `reset` (guard-git hook blocks
  cross-agent ops). Commit subjects are this workflow's own.

## Ground-truth numbers this plan reuses (do NOT re-derive or invent)

From `.kiro/steering/ground-truth.md` and `reference/verify_usage.py`:

- **Seasonal shape** (share of a year's kWh by calendar month, mean of 2019–2025 total MA residential
  sales): Jan .0940 · Feb .0867 · Mar .0802 · Apr .0716 · May .0685 · Jun .0783 · Jul .1044 · Aug .1044 ·
  Sep .0851 · Oct .0708 · Nov .0701 · Dec .0857. These must be **recomputed from
  `data/snapshot/eia_ma_monthly_2026-08.csv`** with the exact method in `verify_usage.py` (per-year sales
  shares, mean over calendar years 2019–2025), asserted equal to the 4-dp values above, then stored at full
  precision normalized to sum to exactly 1.0.
- **Typical MA account, calendar 2025**: 7,135 kWh/yr; monthly 687·652·566·527·483·554·791·710·542·497·459·667
  (sales × 1000 ÷ 12-month trailing mean of customers). Comparison line only; never mixed into the RECS estimate.
- **RECS MA annual kWh**: unweighted median 6,649, mean 7,868 (n=552).
- **RECS weighted median by sq-ft bucket**: `<1000` 4,074 · `1000–1999` 5,974 · `2000–2999` 7,270 · `≥3000` 10,597.
- **RECS weighted median by heating fuel** (`FUELHEAT`): gas(1) 5,616 · oil(3) 8,148 · electricity(5) 6,092 ·
  propane(2) 7,255 · wood(7) 7,270.
- **Estimator fit** `log KWH ~ 1 + log sqft + elec-heat + apartment`, weighted: coefficients
  5.302 / 0.469 / +0.420 / −0.326, weighted **R² 0.34**, n=552. "Real but modest — show a wide band."
- **Basic-service fixed rates Aug 1 2026 – Jan 31 2027** (¢/kWh): NG 17.185 · Eversource East 17.323 ·
  Eversource West 15.934 · Unitil 18.921. Full 22-yr history is in
  `data/snapshot/fixed_residential_cents_2026-07-02.csv` (value sits on the term's **last month**;
  blank = no term ending that month). Column→UtilityId: NG→NG, NSTAR→EV_EAST, WMECo→EV_WEST, Unitil→UNITIL.
- **Calculator formula** (calculator.md §2): `dollars = cents × kWh / 100`, supply portion only; display is
  half-up to cents, internal math unrounded.

## Data-derivation approach per deliverable

### Deliverable 1 — Energy consumption statistics (`consumption_stats.json`)

Two populations, kept separate per ground-truth's explicit warning (never mix RECS and EIA in one computation):

- **"A home like yours" (RECS 2020, 552 MA homes).** Load `data/snapshot/recs_ma_2020.csv`
  (`KWH`, `TOTSQFT_EN`, `FUELHEAT`, `TYPEHUQ`, `NWEIGHT`). Provide:
  - Overall annual kWh: `NWEIGHT`-weighted mean, weighted P10/P50/P90, plus unweighted median 6,649 and
    mean 7,868 as cross-checks (assert equality to ground truth).
  - By sq-ft bucket and by heating fuel: weighted P50 (assert the bucket/fuel medians equal ground truth),
    and weighted P10/P90 bands for each.
  - Monthly bands: annual.pX × seasonal share[m] for each month, so P10≤P50≤P90 holds monthwise.
- **Town / statewide typical (EIA-861M).** Load `data/snapshot/eia_ma_monthly_2026-08.csv`. Recompute the
  12 seasonal shares and the calendar-2025 kWh-per-account monthly vector exactly as `verify_usage.py` does;
  assert both equal ground truth. Report mean/median monthly kWh, annual total 7,135, and the seasonal shape.
- **Seasonal shape** stored at full precision, normalized to sum to exactly 1 (±0.001 tolerance asserted).

Weighted-percentile helper: sort by value, take the weight-cumulative point crossing p·ΣW (same convention as
`verify_usage.py`'s `wmed`, generalized to arbitrary p). Reuse that function's logic verbatim for the median
so the asserted medians match.

### Deliverable 2 — "Money you could have saved" vs basic service (`savings_model.json`)

Counterfactual, supply portion only (calculator.md). Given a household's **actual monthly kWh** and the
**competitive supply rate they actually paid** (¢/kWh) over a period:

```
userMonthly[m]    = userRateCents      × kWh[m] / 100          # what they paid (supply only)
defaultMonthly[m] = basicServiceCents  × kWh[m] / 100          # what basic service would have cost
savedMonthly[m]   = defaultMonthly[m] − userMonthly[m]         # + = SAVED, − = overpaid (signed)
savedTotal        = Σ savedMonthly[m]  over the period
```

- **Sign convention** (stated in code and the contract doc): positive savings = the user paid **less** than
  basic service (they came out ahead); negative = they overpaid. This is `(b − u) × k / 100`, i.e. the sign of
  calculator.md's `diffMonthly = (u − b)×k/100` **flipped**, because the deliverable is framed as "money you
  could have saved" (basic-service minus actual).
- **Default period = 6 months** (per the user's answer "15. 6 month"). The basic-service rate used for each
  month is the fixed rate in effect for that calendar month for the chosen utility, read from the 22-yr history
  in `fixed_residential_cents_2026-07-02.csv` (terms sit on the last month; a month's rate = the term whose
  span covers it — derive term spans with the same "previous end + 1 month" rule as `reference/ingest_rates.py`
  `derive_terms`). For a forward-looking default 6-month window ending Jan 2027, that is the
  Aug 2026–Jan 2027 term (NG 17.185, etc.).
- Output both a reusable **function** (`savings(kwh, user_rate_cents, utility, start_ym, months=6)`) and a
  **worked example set** baked into the JSON so the frontend has a concrete contract sample. Internal math
  unrounded; expose a `display` string half-up to cents matching calculator.md's regex
  `^-?\$\d{1,3}(,\d{3})*\.\d{2}$`.

### Deliverable 3 — Per-town map data (`map_consumption.json`) + traffic-light

**Honest-data gap (documented, not invented).** There is **no verified per-town consumption source** in the
repo: RECS has no town field, EIA-861M is statewide, and `docs/apis/06` lists all town layers as UNVERIFIED.
`docs/specs/map.md` §4 says "never color by a number we don't have." Therefore the per-town value is an
explicit **MODEL**, labeled as such, never presented as measured town data.

**Chosen model (transparent, deterministic, documented in the contract doc):** each town's consumption index
is the statewide RECS weighted annual-kWh distribution expressed as the town's position relative to the MA
weighted median. With no per-town home-characteristic source, every town carries the **same** modeled central
value (the state weighted P50) plus the band — so the raw number is identical across towns and a choropleth of
the *level* would be flat. The traffic-light therefore classifies the **state distribution bands**, not
between-town differences, and each record is flagged `basis: "statewide-model"` and
`modeled: true`. This keeps us honest: we do not fabricate town-to-town variation we cannot source.

- **Traffic-light rule (terciles of the statewide RECS weighted annual-kWh distribution):**
  - **GREEN** = good/low consumption: annual kWh **≤ weighted P33** of the RECS MA distribution.
  - **GREY** = mid: **P33 < kWh ≤ P66**.
  - **RED** = too-much consumption: **kWh > weighted P66**.
  The P33/P66 cut values are computed from `recs_ma_2020.csv` (weighted) and written into the artifact's
  `thresholds` block so the frontend and tests share one source of truth. (Terciles chosen over
  "distance-from-median" because the user's own spec is a 3-class green/grey/red and terciles map 1:1 to three
  classes with equal population mass — documented rationale.)
- The 351-town set comes from the map geometry pipeline. `data/build/towns.json` is **not yet built**
  (`build_geo.mjs` needs a network download the sandbox can't reach). So the map artifact must **not** hard-depend
  on `towns.json`; instead it emits one record per town id 1..351 keyed by `townId`, carrying the modeled
  level, the `class`, and the shared `thresholds`/`basis` metadata, designed to be **joined to `towns.json`
  on `id`** by the frontend. If `towns.json` exists at build time, read the real `id`/`name`/`census` and
  include `name`/`census`; otherwise emit ids 1..351 with `name: null` and record the fallback in `findings`.

## Exact JSON output shapes (the frontend contract)

### `data/build/consumption_stats.json`
```json
{
  "generated": "2026-10-24",
  "sources": ["S14 RECS 2020 (552 MA homes)", "S15 EIA-861M (200 months)"],
  "homeLikeYours": {
    "population": "RECS 2020 MA, NWEIGHT-weighted",
    "annualKwh": { "mean": 7868.0, "p10": 0.0, "p50": 6649.0, "p90": 0.0, "n": 552 },
    "monthlyKwh": [ { "month": 1, "p10": 0.0, "p50": 0.0, "p90": 0.0 }, "... 12 entries" ],
    "bySqftBucket": { "<1000": { "p10":0,"p50":4074,"p90":0 }, "1000-1999": {}, "2000-2999": {}, "3000+": {} },
    "byHeatFuel":  { "gas": {"p50":5616}, "oil": {"p50":8148}, "electricity": {"p50":6092},
                     "propane": {"p50":7255}, "wood": {"p50":7270} }
  },
  "typicalAccount": {
    "population": "EIA-861M MA residential, calendar 2025 (sales/account)",
    "annualKwh": 7135,
    "monthlyKwh": [687,652,566,527,483,554,791,710,542,497,459,667],
    "note": "all residential accounts incl. apartments/seasonal; shown alongside RECS, never mixed"
  },
  "seasonalShares": [0.0940, 0.0867, 0.0802, 0.0716, 0.0685, 0.0783,
                     0.1044, 0.1044, 0.0851, 0.0708, 0.0701, 0.0857],
  "seasonalSharesSum": 1.0
}
```
(`seasonalShares` stored full-precision normalized; the 4-dp values above are the asserted anchor.)

### `data/build/savings_model.json`
```json
{
  "generated": "2026-10-24",
  "method": "supply-portion-only; saved = (basicService - userRate) * kWh / 100; + = saved, - = overpaid",
  "defaultPeriodMonths": 6,
  "basicServiceRatesCents": { "NG": 17.185, "EV_EAST": 17.323, "EV_WEST": 15.934, "UNITIL": 18.921,
                              "term": "2026-08..2027-01" },
  "examples": [
    {
      "label": "6 months on NG, paid 22.0c vs basic 17.185c, 650 kWh/mo",
      "utility": "NG", "userRateCents": 22.0, "months": ["2026-08","2026-09","2026-10","2026-11","2026-12","2027-01"],
      "kwhByMonth": [650,650,650,650,650,650], "basicServiceCentsByMonth": [17.185,17.185,17.185,17.185,17.185,17.185],
      "savedMonthly": [-31.30, -31.30, -31.30, -31.30, -31.30, -31.30],
      "savedTotal": -187.79, "savedTotalDisplay": "-$187.79"
    }
  ]
}
```
(Signed: here the user paid MORE than basic service, so savings are negative. Hand-worked below.)

### `data/build/map_consumption.json`
```json
{
  "generated": "2026-10-24",
  "basis": "statewide-model",
  "modeled": true,
  "note": "No verified per-town consumption source exists; level is the statewide RECS weighted model. Classes reflect state distribution bands, not measured town differences.",
  "thresholds": { "unit": "annual kWh", "greenMax": 0.0, "greyMax": 0.0,
                  "rule": "GREEN <= P33 < GREY <= P66 < RED (weighted terciles of RECS MA annual kWh)" },
  "towns": [
    { "townId": 1, "name": null, "census": null, "annualKwhModel": 6649.0, "class": "GREY" }
  ]
}
```

## pytest test cases (`tests/backend/`)

`tests/backend/test_consumption_stats.py`
1. **Bands ordering:** for the overall annual band and all 12 monthly bands, assert `p10 <= p50 <= p90`.
2. **Seasonal shares sum:** `abs(sum(seasonalShares) - 1.0) <= 0.001`; and each 4-dp-rounded share equals the
   ground-truth anchor vector.
3. **Ground-truth anchors:** weighted sq-ft-bucket medians equal {4074,5974,7270,10597}; fuel medians equal
   {gas 5616, oil 8148, elec 6092, propane 7255, wood 7270}; unweighted median annual = 6649; mean = 7868;
   typical annual = 7135 with the 12-month vector matching ground truth.

`tests/backend/test_savings.py`
4. **Sign + magnitude (hand-worked):** NG, userRate 22.0¢, basic 17.185¢, 650 kWh, 6 months.
   Monthly saved = (17.185 − 22.0) × 650 / 100 = −31.2975 → display −$31.30; total = 6 × −31.2975 = −187.785
   → display **−$187.79** (half-up). Assert the function returns −187.785 (unrounded, within 1e-9) and the
   display string `-$187.79`. **Positive case:** userRate 15.0¢ vs NG 17.185¢, 600 kWh, 1 month →
   (17.185 − 15.0) × 600 / 100 = **+13.11** (mirrors calculator.md G4's −13.11 with the flipped sign) → +$13.11.
5. **Zero + linearity:** userRate == basic → saved == 0; saved scales linearly in kWh (saved(k1+k2) =
   saved(k1)+saved(k2) within 1e-9); 6-month total == sum of the 6 monthly values exactly.
6. **Rate lookup:** the basic-service rate selected for months Aug 2026–Jan 2027 equals the current-term fixed
   rate for each utility (NG 17.185, EV_EAST 17.323, EV_WEST 15.934, UNITIL 18.921).

`tests/backend/test_map.py`
7. **Traffic-light thresholds:** `greenMax == weighted P33` and `greyMax == weighted P66` of the RECS annual
   distribution; a value ≤ greenMax classifies GREEN, greenMax<..≤greyMax GREY, >greyMax RED (boundary tests
   at exactly P33 and P66).
8. **Coverage + shape:** exactly 351 town records, each with a `class` in {GREEN,GREY,RED} and the shared
   `thresholds`/`basis`; `modeled` is true; every `annualKwhModel` finite and > 0.

All three artifacts additionally get a test that the written JSON round-trips (`json.load`) and contains the
required top-level keys named in the shapes above.

## Verification commands (project-real)

- `python3 src/backend/build_stats.py` (or the three build entrypoints) regenerates all three artifacts into
  `data/build/` with no error and prints a one-line summary each.
- `python3 -m pytest tests/backend -q` — all new tests pass (this is the gate; grep is NOT verification).
- `python3 reference/verify_usage.py data/snapshot/recs_ma_2020.csv data/snapshot/eia_ma_monthly_2026-08.csv`
  still prints `G-DATA-3: PASS` (confirms we did not disturb the snapshot the stats derive from).

## Ordered items

- [ ] 1. Create `src/backend/` package with a shared data-loading module.
      Loaders: `load_recs()`, `load_eia()`, `load_fixed_rates()` reading `data/snapshot/*`; a
      `weighted_percentile(values, weights, p)` helper (generalizing `verify_usage.py`'s `wmed`); a
      `seasonal_shares()` that recomputes + asserts against ground truth; a `term_spans()` helper mirroring
      `reference/ingest_rates.py` `derive_terms`. Pure functions, no file writes.
      Files: `src/backend/__init__.py`, `src/backend/data_sources.py`
      Verify: `python3 -m pytest tests/backend/test_data_sources.py -q` — loader/percentile unit tests pass
      (P33/P66/P50 match ground-truth medians).

- [ ] 2. Implement consumption statistics + its build entrypoint and artifact.
      Files: `src/backend/stats_consumption.py`, `src/backend/build_stats.py`, writes
      `data/build/consumption_stats.json`
      Verify: `python3 src/backend/build_stats.py` writes the file; `python3 -m pytest
      tests/backend/test_consumption_stats.py -q` passes (tests 1–3 above).

- [ ] 3. Implement the savings counterfactual + its build entrypoint and worked-example artifact.
      Files: `src/backend/savings_model.py`, `src/backend/build_savings.py`, writes
      `data/build/savings_model.json`
      Verify: `python3 src/backend/build_savings.py` writes the file; `python3 -m pytest
      tests/backend/test_savings.py -q` passes (tests 4–6, including the hand-worked −$187.79 and +$13.11).

- [ ] 4. Implement per-town map data + traffic-light classification + its build entrypoint and artifact.
      Reads `data/build/towns.json` if present else emits ids 1..351; writes thresholds from RECS terciles.
      Files: `src/backend/map_consumption.py`, `src/backend/build_map.py`, writes
      `data/build/map_consumption.json`
      Verify: `python3 src/backend/build_map.py` writes the file; `python3 -m pytest
      tests/backend/test_map.py -q` passes (tests 7–8).

- [ ] 5. Write the frontend contract doc describing all three JSON shapes, the sign convention, the
      traffic-light rule, and the modeled-town-data honesty caveat.
      Files: `research/backend-stats.md`
      Verify: `python3 -m pytest tests/backend -q` still green; manually confirm the doc's shapes match the
      three emitted artifacts (diff the key lists).

- [ ] 6. Integration pass: regenerate all artifacts, run the full backend test suite and the untouched
      G-DATA-3 gate, and stage only the new files by name.
      Files: (verification only; stages `src/backend/**`, `tests/backend/**`, the three `data/build/*.json`,
      `research/backend-stats.md`)
      Verify: `python3 -m pytest tests/backend -q` all pass; `python3 reference/verify_usage.py
      data/snapshot/recs_ma_2020.csv data/snapshot/eia_ma_monthly_2026-08.csv` prints `G-DATA-3: PASS`.

## Open risks / assumptions (made, not stalled on)

- **No per-town consumption source** → map level is an explicit statewide model flagged `modeled:true`; classes
  reflect state distribution bands. This is the honest reading of agent-rule #1 and map.md §4. If a verified
  town-level source appears, swap the model behind the same artifact shape.
- **`research/backend-stats.md` / `src/backend/` ownership:** not in `structure.md`'s table. Assumed allowed as
  new backend-only paths for this workflow; if G-OWN flags them, relocate under `docs/research/` and note a
  REQUEST. Does not block the computation.
- **`towns.json` not built in-sandbox** → map artifact is self-contained (ids 1..351) and join-ready, not a
  hard dependency.
