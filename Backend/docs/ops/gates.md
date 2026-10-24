# Gates: exact commands and pass conditions

A gate is binary. "Mostly passes" = FAIL. The orchestrator re-runs the command; a pasted "pass" is not evidence.
If `reference/` was removed under Gate 0 rules, the numeric pass conditions below are still the spec. Re-create the checker from them (`docs/ops/friday-prep.md`).

| Gate | Owner | Command | Pass condition |
|---|---|---|---|
| **G-DATA-1** | orchestrator (data-ingest on failure) | `python3 reference/verify_snapshot.py data/build/monthly_residential_cents.csv data/build/fixed_residential_cents.csv` | Prints `G-DATA-1: PASS`: rows 265/122, per-column counts and sums exact (docs/apis/01 §4), 8 anchors |
| **G-DATA-2** | orchestrator (data-ingest on failure) | `python3 -c "import json;from jsonschema import Draft202012Validator as V,FormatChecker as F;v=V(json.load(open('contracts/rates.schema.json')),format_checker=F());e=list(v.iter_errors(json.load(open('data/build/rates.json'))));print(len(e));assert not e"` | Prints `0`; `current` = 17.185 / 17.323 / 15.934 / 18.921 with term 2026-08…2027-01 |
| **G-DATA-3** | orchestrator (data-ingest on failure) | `python3 reference/verify_usage.py data/build/recs_ma.csv data/build/eia_ma_monthly.csv` | Prints `G-DATA-3: PASS`: 552 RECS rows / 200 EIA months, sums, category counts, anchors, and the re-derived ground-truth numbers |
| **G-GEO** | orchestrator (geo-map on failure) | `node scripts/build_geo.mjs data/raw/mass-municipalities.geojson data/build/towns.json 300 1` | Prints `PASS` (351 towns; ids 1..351; ≥ 345 distinct centroids, **351 expected**; gzip ≤ 150 KB; raw ≤ 600 KB). Schema check as in G-DATA-2 with `towns.schema.json`. **Orchestrator visual sign-off** on `data/build/towns.preview.svg` |
| **G-LAYER** (optional) | human (TC) | manual: `research/map_layers.md` | Coverage ≥ 95% of 351; 10-town spot check with ≤ 1 mismatch; every row has a URL and date. If not passed: map is a locator |
| **G-EST** | calc-engine | `npx vitest run tests/engine` + the fit script's asserts + schema check of `data/build/estimate_model.json` against `contracts/estimate_model.schema.json` | 0 failures; goldens E1–E6, B1–B4, T1 present by name; estimator.md §6 properties at ≥ 500 runs; schema 0 errors; `research/estimator.md` lists both candidates' LOO numbers and the choice |
| **G-CALC** | calc-engine | `npx vitest run tests/engine` | 0 failures; goldens G1a–G4 present by name; 6 properties at ≥ 500 runs |
| **G-FC** | forecaster | `npx vitest run tests/forecast` (TS) or `python3 tests/forecast/<check>.py` (Python, plain asserts) + schema checks of `forecast.json` and `usage_forecast.json` | Both leakage tests pass; both schemas 0 errors; `research/backtest.md` has **both** ship-rule decisions with numbers |
| **G-UI** | ui-builder | `npm run build && npx playwright test tests/ui` | All pass: no console errors, no horizontal scroll, keyboard path, every ui.md §2 state reachable (incl. estimated ↔ from-your-bills); screenshots `mobile-light` and `desktop-dark` |
| **G-CLAIMS** | copy-compliance | `grep -rn "TODO-SOURCE" src docs/claims.md` (expect no output) | No hits; every visible number traces to a claim ID or computed output; "estimated" and "supply portion" labels present |
| **G-OWN** | orchestrator, at **each wave boundary** and before freeze | `python3 reference/check_ownership.py --commits <W0b-hash>..HEAD \| tee -a research/merge-log.md` | `G-OWN commits: PASS` (every commit's files are owned by the agent named in its subject; W0b commit exempt) |
| **G-REL** | release | `rm -rf node_modules .next out && npm ci && npm run build`, then a phone test | Clean build passes; prod URL loads on a phone (time measured); DEMO.md + SUBMISSION.md complete; fallback recording exists; latest commit visible on github.com |
| **G-VERIFY** | verifier | `research/verification.md` | 0 open blockers; majors either fixed or listed under "Limits" in DEMO.md |
| **G-KIRO** | orchestrator, **18:30–18:45** | `python3 reference/kiro_usage_report.py --check --base <W0b-hash>` | Prints `G-KIRO: PASS`: ≥ 5 steering files with `inclusion:`; a spec folder (requirements, design, tasks) with ≥ 70% of tasks ticked; ≥ 2 valid hooks; ≥ 4 worker agents with commits; `docs/KIRO.md` has no TODO and a filled `Credits used:` line |
| **G-SUBMIT** | human (TC), **18:45** | SundAI project card | Track = Energy & climate tech; GitHub repo URL = the Kiro-connected repo; live URL works; SundAI shows **submitted**; screenshot in `research/CHANGELOG.md` |

**Commit rule:** an agent's work counts only after its gates pass **and** G-OWN passes at the wave boundary. After each wave: `npm test` plus the build command for the current phase (`docs/ops/scaffold.md` "Build command by phase").
