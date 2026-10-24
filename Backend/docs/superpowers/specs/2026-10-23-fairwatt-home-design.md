# FairWatt Home: design (Oct 23 2026, for the Hackachusetts build on Oct 24)

Supersedes the product scope in `WORKFLOW.md` §1 and `.kiro/steering/product.md` ("FairWatt Lite").
Tags: **[V]** verified tonight with a source and a command; **[U]** unverified; **[call]** a decision made by the author, open to override.

## 1. Intent

A judge opens the app at 7 pm and sees a Massachusetts household's electricity three ways:

1. **A home like yours.** The user picks their town, then types home size, age, housing type and how they heat. The app shows what a home like that uses each month of the year, with a band, and how that compares with the typical Massachusetts home.
2. **Your next six bills.** The app forecasts the next six months of kWh, multiplies by the utility's basic-service supply rate (including the Feb 1 2027 reset the kit already forecasts) and shows a dollar range per month. Each forecast carries an honest backtest badge.
3. **What to do about it.** If the user has a competitive supplier, the existing calculator shows what they'd pay on basic service instead, in both directions. A "trim 10% in winter" scenario shows the saving in dollars.

Anyone who has their bills can type up to 12 months of kWh; the estimate is replaced by their numbers and the curve re-scales.

**Why this shape.** TC's idea is a per-house energy analyzer and forecaster. No app can fetch a stranger's usage from an address: that data belongs to the customer and sits in the utility's account system. So the product *estimates* from public data and lets the user *refine* with their own. The kit's verified rate history and walk-forward forecast method become the bill engine; nothing already verified is thrown away.

**Why it fits the track.** Energy & climate tech: "Tackle how we power our world." The demand side of that question, for the people who pay for it. Massachusetts has among the highest residential rates in the country; the state AG reports households on competitive supply paid $738.7M more than basic service since 2018 (kit ground truth, S2).

## 2. Goals, non-goals, anti-goals

**Goals (must ship, in priority order)**
- G1 **Estimate.** Town + home facts → 12 monthly kWh estimates with a P10–P90 band, labeled *estimated for a home like yours*. Sources: RECS 2020 Massachusetts rows for the level, EIA-861M Massachusetts for the seasonal shape (§4).
- G2 **Forecast bills.** Next six calendar months: kWh forecast × basic-service supply rate → P10/P50/P90 dollars per month and a six-month total. Rate for Feb–Jul 2027 comes from the kit's existing F2 forecast (`docs/specs/forecast.md`), unchanged. Two badges: one for the kWh forecast, one for the rate forecast.
- G3 **Compare and act.** The kit's F1 calculator (supply rate vs basic service, both directions, per month and year) plus one scenario: trim X% in the two highest months → dollars saved.
- G4 **Refine.** Type 1–12 months of kWh. With ≥ 3 months the estimated curve is scaled to the user's mean; with 12 months the user's own shape is used. The label changes from *estimated* to *from your bills*.
- G5 **Town picker.** The kit's 351-town map (F3) is the town input. Locator only unless the L1 utility layer passes its gate; then the town also prefills the utility.

**Non-goals (not tomorrow)**
- Fetching anyone's bills or usage. Linking utility accounts (Bayou Energy, UtilityAPI) is one pitch slide: the production path.
- Address → parcel → home facts (MassGIS assessor data). One pitch slide. MassGIS blocked automated download tonight [U].
- Green Button XML/CSV upload. Cut-list item #1 (§8). The Green Button Alliance sample files (Amazon S3 links) returned 403 tonight, so the parser can't be tested before the event.
- Carbon or emissions figures. No verified Massachusetts marginal-emissions source in hand.
- Accounts, stored user data, runtime API calls, supplier recommendations, legal or financial advice (unchanged from the kit).

**Anti-goals (a failure even if it works)**
- Any number on screen without a source ID or a computation on sourced data.
- A badge that says "accurate" or hides `n`. Badges state "beat the no-change guess in N of M past months/resets".
- Presenting the estimate as the user's actual usage. The word *estimated* stays on screen until the user types their own numbers.
- A demo that needs Wi-Fi (the app is static) or a logged-in account.
- Calling competitive suppliers scams; hindsight framing only ("you would have paid").

## 3. Constraints (event facts, verified Oct 23 from the event page's JS bundle)

| Fact | Value | Consequence |
|---|---|---|
| Tooling | "Your vibe-coded project was built using Kiro, as required" | Build in Kiro, not Claude Code. The `.claude/` mirror stays as a fallback only |
| Hacking begins | 11:30 | Build window ≈ 7 h (11:30–18:30 freeze). The old runbook's 09:35 start is wrong |
| Challenges & rules talk | 09:40–10:00 | Fit check happens here. Prompt text is unknown until then |
| Brainstorm/team window | 10:40–11:30 | Usable for setup, Gate 0 answer, scaffold if allowed |
| Submission | SundAI project card + correct GitHub repo, 6–8 PM; "pushing to GitHub does not complete your submission" | New gate G-SUBMIT at 18:45 |
| Team | ≤ 4, solo allowed; MA students, .edu, ID checked | — |
| Kiro credits | 2,000 per person, physical code at check-in | Credit budget is a resource gate (§7) |
| Judging criteria | not published ("ask your campus host") | Ask at check-in; default to: works, honest, clear, real data |
| Pre-built code | **not stated** | Gate 0 unchanged: ask at check-in; prepare both repo versions |
| Finalists | "~50 finalists… at midnight" and "12–20 finalist teams" (page contradicts itself) | Irrelevant to the build |

Technical constraints carry over from `.kiro/steering/tech.md`: Next.js static export, pinned deps from `scaffold/`, zero runtime external calls, hand-written SVG charts, zod validation of every JSON at load.

## 4. Data [V] (downloaded and inspected tonight; commands in §10)

| ID | Source | What | Verified facts |
|---|---|---|---|
| S14 | EIA RECS 2020 public microdata v7, `https://www.eia.gov/consumption/residential/data/2020/csv/recs2020_public_v7.csv` (56 MB, 18,496 rows, 799 cols) + codebook `xls/RECS 2020 Codebook for Public File - v7.xlsx` | Household survey, 2020 consumption | 552 rows with `state_postal == "MA"`. Fields: `KWH` (annual kWh), `TOTSQFT_EN` (200–15000), `YEARMADERANGE` (1 = before 1950 … 9 = 2016–2020), `FUELHEAT` (5 electricity, 1 natural gas, 2 propane, 3 fuel oil, 7 wood, 99 other, −2 n/a), `TYPEHUQ` (1 mobile, 2 SF detached, 3 SF attached, 4 apt 2–4, 5 apt 5+), `EQUIPM`, `NWEIGHT`, `HDD65`, `CDD65`. MA annual kWh, unweighted: median 6,649, mean 7,868 |
| S15 | EIA-861M `https://www.eia.gov/electricity/data/eia861m/xls/sales_revenue.xlsx`, sheet `Monthly-States` (2.3 MB) | Monthly retail sales by state and sector | MA residential: 200 months, 2010-01 → 2026-08 (Aug 2026 "Preliminary"). Columns: Year, Month, State, Data Status, then Residential Revenue ($k), **Sales (MWh)**, **Customers**, Price (¢/kWh). kWh/customer/month, mean by calendar month 2010–2026: Jan 694, Feb 635, Mar 588, Apr 514, May 489, Jun 568, Jul 746, Aug 740, Sep 621, Oct 507, Nov 513, Dec 623. Peak/trough 1.53 |
| S1–S3 | Mass.gov basic-service rate history (already in `data/snapshot/`) | Rates 2005 → Jan 2027, 4 utilities | Unchanged; G-DATA-1 PASS re-run tonight |
| S5 | LMEC/MassGIS town boundaries (already in kit) | 351-town geometry | Unchanged |

**Signal checks (why the estimator is worth building)**
- Size: MA weighted median annual kWh by `TOTSQFT_EN` bucket: < 1,000 → 4,074; 1,000–1,999 → 5,974; 2,000–2,999 → 7,270; ≥ 3,000 → 10,597.
- Heating fuel: natural gas 5,616; fuel oil 8,148; electricity 6,092; propane 7,255 (small n). Electric heat does **not** dominate in MA; oil-heated homes use more electricity than gas-heated ones. Don't assume; let the fit decide.
- Weighted log-linear fit on the 552 MA rows, `log KWH ~ 1 + log TOTSQFT_EN + [FUELHEAT==5] + [TYPEHUQ in {4,5}]`: coefficients ≈ 5.30, **0.47**, **+0.42** (×1.52), **−0.33** (×0.72); weighted R² ≈ 0.34. Real but modest: the band must be wide and shown.
- Seasonality: predicting MA kWh/customer for a month by the **same month last year** has MAPE 6.0%; by **last month** 12.8%. The seasonal-naive forecaster is the baseline to beat, and it already beats random walk by 2×.

**Not obtained tonight [U]:** Green Button sample XML (Amazon S3 links: 403), NSTAR monthly sample (energy.gov 404), MassGIS assessor field list (mass.gov 403 to scripts). None blocks G1–G5.

## 5. Method (decided; the builder implements, the backtest decides details)

**5.1 Level (annual kWh for a home like yours).** Fit on RECS MA rows, weighted by `NWEIGHT`. Two candidates, pick by leave-one-out error, report both in `research/estimator.md`:
- (a) weighted log-linear regression on `log TOTSQFT_EN`, electric-heat flag, apartment flag, and optionally `YEARMADERANGE` as a numeric 1–9;
- (b) weighted median of the nearest-neighbour cell (sq ft bucket × heat fuel group × housing type group), pooled up a level when `n < 15`.
Band: P10/P90 of the model's LOO residuals in log space, applied multiplicatively. Inputs the UI asks for: sq ft (slider with bucket labels), year built (9 ranges), housing type (5), heating fuel (electricity / gas / oil / propane / wood or other). **[call]** No heat-pump or AC question in v1; `EQUIPM` exists if time allows.

**5.2 Shape (12 monthly shares).** From S15 **total residential sales** (not per customer: customer counts jump ±3–10% month to month): for each year 2019–2025, `share_m = sales_m / Σ_year sales`; take the mean over years. Values are frozen in ground-truth.md and re-derived by G-DATA-3. **[call]** 2019–2025 (7 complete years, post-LED-transition, includes 2020). Monthly estimate = annual level × share_m. Shares sum to 1 by construction; test it.

**5.3 Refine with the user's months.** `n_user ≥ 3`: scale the estimated curve so its mean over the user's months equals the user's mean. `n_user = 12`: use the user's values as the curve. Label switches to *from your bills*. Fail closed on any kWh outside 50–5,000 per month ("no estimate, here's why").

**5.4 kWh forecast (the six calendar months after the current one: on Oct 24 2026 that is Nov 2026 → Apr 2027, which straddles the Feb 1 reset).** The information set is everything published up to the forecast origin (S15 runs through Aug 2026; the user's own months if typed). Baseline K0 = same calendar month one year earlier (from the user's data when present, else the typical curve scaled to the user's level). Candidate K1 = K0 × trend ratio (last 12 months ÷ prior 12 months, from S15). Walk-forward backtest on S15 MA kWh/customer, cuts 2013-01 → 2026-08, strict information set (only months before the forecast origin). Ship rule, mechanical: ship K1 only if MAE(K1) < MAE(K0) and 80% coverage in [0.70, 0.90]; else ship K0 with label "seasonal pattern only". Band = empirical quantiles of past out-of-sample log residuals. Leakage test as in the kit's forecast spec: perturb future months, outputs must be bit-identical.

**5.5 Dollars.** Supply cost only: `kWh × rate / 100`. Rate per month: Aug 2026–Jan 2027 = current fixed basic-service rate per utility (ground truth); Feb–Jul 2027 = F2 forecast P10/P50/P90 (unchanged spec). Monthly dollar band = kWh band × rate band, combined by taking the (P10 kWh × P10 rate), (P50 × P50), (P90 × P90) products. **[call]** This treats the two uncertainties as co-moving, which is conservative (wider) and simple; state it in the drawer. Delivery charges are out of scope and the UI says "supply portion of your bill".

**5.6 Act.** F1 as specified in `docs/specs/calculator.md`. Scenario: trim X% (default 10%) in the two highest forecast months → Δ$ at P50.

## 6. Screens (mobile-first; one page, four cards; sources drawer; table under every chart)

1. **Your home.** Town (search box + the map as picker), utility (prefilled if L1 passed, else a 4-way choice: National Grid, Eversource East, Eversource West, Unitil), sq ft, year built, type, heating. Two optional fields: "Have your bills? Enter kWh for up to 12 months" and "Your supply rate from the bill (¢/kWh)". Without a supply rate, card 4 shows the basic-service cost and the trim scenario only.
2. **A home like yours.** 12-bar monthly kWh chart with a shaded P10–P90 band and a line for the typical MA home (S15, calendar 2025, kWh per residential customer). Caption: "Estimated from 552 Massachusetts homes in the 2020 federal survey and 16 years of state monthly data." Switches to "from your bills" after refine. Drawer note: the S15 "typical" line averages every residential account (apartments, seasonal and vacant homes included), a different population from the RECS survey; the two are shown together but never mixed in one computation.
3. **Your next six bills.** Six bars in dollars with range; six-month total; two small badges: "kWh: beat 'same as last year' in N of M months" / "rate: beat 'no change' in N of M resets" (or the no-skill wording). Rate source line.
4. **What you can do.** F1 result in both directions (if a supply rate is entered) and the trim scenario. Sources drawer lists S1–S3, S5, S14, S15 with URLs and access dates.

Framing rules from `.kiro/steering/product.md` apply unchanged. **[call]** Keep the name **FairWatt** (now "FairWatt Home"), since agent configs, folders and the pitch already use it; only the tagline changes.

## 7. Workflow changes (what "fixing the kit" means)

1. **Event facts** in `product.md`, `ground-truth.md`, `runbook-saturday.md`, `friday-prep.md`, `open-questions.md`: replace the S7 "not stated" items with §3. Kiro is required; `.claude/` becomes fallback-only.
2. **Timeline** re-cut to the real day: 08:00 check-in (Gate 0 in person, Kiro code, SundAI check) → 09:40 fit check during the rules talk → 10:40–11:30 scaffold + data copy if pre-built code is allowed (else at 11:30) → **W1 11:30/11:50–14:30** → merge → **W2 14:30–16:30** → cut decision 16:00 → verify #1 16:30 → fixes → verify #2 18:00 → **freeze 18:30** → **G-SUBMIT 18:45** (SundAI card, track, repo link, "submitted" state confirmed) → buffer to 20:00.
3. **Agents (9 workers → 8, one renamed, two re-briefed):** `data-ingest` also extracts S14/S15 to `data/build/recs_ma.csv` (the 552 MA rows, ~10 columns; the 56 MB raw file stays in git-ignored `data/raw/`) and `data/build/eia_ma_monthly.csv` (200 rows: year, month, sales_mwh, customers, kwh_per_customer) with checksummed verifiers (G-DATA-3); `calc-engine` adds the estimator (§5.1–5.3) and dollars (§5.5–5.6) with golden + property tests (G-EST); `forecaster` owns both forecasts (§5.4 + existing F2) and both badges (G-FC); `layer-research` is **dropped as an agent** (L1 becomes a 30-min human task in the brainstorm window; if it fails, locator only); `geo-map`, `ui-builder`, `copy-compliance`, `verifier`, `release` keep their briefs with the new contracts. Contracts gain `estimate_model.schema.json` and `usage_forecast.schema.json`; `types.ts` and `VERSION` bump.
4. **Git protocol fit for Kiro.** Kiro sub-agents share one working tree, so "one branch per agent" is replaced by **one branch, commit-prefix ownership**: every agent commits as `<agent>: <what> (<gate>: pass)`; `check_ownership.py` gains a `--commits <from>..<to>` mode that maps each commit's files to the agent in its subject and fails on any violation. G-OWN runs at each wave boundary and before freeze, output appended to `research/merge-log.md`. The W0b scaffold commit is prefixed `orchestrator:` and stays the one exempt commit, as today. A commit whose subject has no known agent prefix is itself a violation.
5. **Credit budget.** 2,000 credits × team size. Orchestrator records remaining credits at every checkpoint in `research/CHANGELOG.md`. Spend order if short: data-ingest → calc-engine → forecaster → ui-builder → verifier; copy and polish by humans. **[U]** Kiro's cost per sub-agent run is undocumented; the 10:00–10:30 Kiro talk and the first W1 run calibrate it.
6. **Cut list** re-ordered (§8). **Gates** gain G-DATA-3, G-EST, G-SUBMIT; G-LAYER becomes optional.
7. **Pitch**: `demo-script.md` rewritten around the three screens plus one "production path" slide (link your utility account; address → assessor data).

## 8. Cut list (from the top when behind; decided now)

1. Green Button file upload (was never core) · 2. L1 utility layer + prefill → locator only · 3. K1 trend model → ship K0 "seasonal pattern only" · 4. Estimator candidate (b) → ship (a) only · 5. Trim scenario · 6. Dark-mode polish · 7. Fan/band shading → plain P10–P90 bars.
**Never cut:** G-DATA-1/3 · G-EST · G-CLAIMS · verifier pass · the word *estimated* · both-directions result · sources drawer · G-SUBMIT.

## 9. Left to the builder

Estimator candidate choice (by LOO error); exact year window for shares if 2019–2025 fails a sanity test (shares within 0.06–0.11 each); chart geometry and type scale (ui.md); copy wording within the framing rules; whether `YEARMADERANGE` enters the regression (keep only if LOO improves).

## 10. Reproduction (tonight's checks)

```bash
# RECS 2020 (S14)
curl -L "https://www.eia.gov/consumption/residential/data/2020/csv/recs2020_public_v7.csv" -o recs2020_public_v7.csv
curl -L "https://www.eia.gov/consumption/residential/data/2020/xls/RECS%202020%20Codebook%20for%20Public%20File%20-%20v7.xlsx" -o codebook.xlsx
# expect 18496 rows, 552 with state_postal == MA; fields KWH TOTSQFT_EN YEARMADERANGE FUELHEAT TYPEHUQ NWEIGHT present
# EIA-861M (S15)
curl -L "https://www.eia.gov/electricity/data/eia861m/xls/sales_revenue.xlsx" -o sales_revenue.xlsx
# sheet Monthly-States; rows with col C == "MA": 200 (2010-01..2026-08); residential Sales MWh = col F, Customers = col G
```
Checksums and row counts are written into `data/snapshot/README.md` by data-ingest's verifier on build day (or Friday night if pre-built data is allowed).
