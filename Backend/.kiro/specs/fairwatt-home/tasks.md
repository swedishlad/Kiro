# Implementation Plan

Each task names its executor in parentheses. The orchestrator delegates by name ("Use the calc-engine agent to …"), re-runs the listed gate, and ticks the box in a commit prefixed `orchestrator:`. Waves follow `docs/ops/runbook-saturday.md`.

- [ ] 1. Set up the workspace (orchestrator)
  - [ ] 1.1 Trust the workspace in Kiro, keep Autopilot on, add trusted shell commands (`docs/ops/runbook-saturday.md` setup)
  - [ ] 1.2 Run the Kiro smoke test and record starting credits (`docs/apis/04-kiro-agents-and-steering.md` §5)
  - [ ] 1.3 Copy the scaffold, `npm ci`, `next build`, tests green; record the W0b commit hash in `research/merge-log.md`
  - _Requirements: 8.2_

- [ ] 2. Prepare data (orchestrator runs the tested scripts; delegate to data-ingest only on failure)
  - [ ] 2.1 `ingest_rates.py` and `ingest_usage.py` from the snapshots into `data/build/`; gates G-DATA-1, G-DATA-2, G-DATA-3 pass
  - [ ] 2.2 `build_geo.mjs` → `towns.json`; gate G-GEO passes with visual sign-off
  - [ ] 2.3 Write `tests/data/check_rates.py` and `check_usage.py` (data-ingest)
  - _Requirements: 6.1, 7.2_

- [ ] 3. Build the estimator (calc-engine)
  - [ ] 3.1 Fit LOGLINEAR and CELL_MEDIAN with leave-one-out; write `estimate_model.json` and `research/estimator.md`
    - Schema validates; coefficients near 5.302 / 0.469 / 0.420 / −0.326 without year built
    - _Requirements: 1.1, 1.5_
  - [ ] 3.2 `estimate()` with validation and refine; goldens E1–E6 and properties pass
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 2.1, 2.2, 2.3, 2.4_

- [ ] 4. Build the forecasts (forecaster)
  - [ ] 4.1 Shared walk-forward harness and both leakage tests; K0 and M0
    - _Requirements: 4.1_
  - [ ] 4.2 K1 and M1; backtest tables
    - _Requirements: 4.1_
  - [ ] 4.3 M2 if time; apply both ship rules; write `usage_forecast.json`, `forecast.json`, `research/backtest.md`
    - _Requirements: 4.2, 4.3, 4.4_

- [ ] 5. Build the bill math and calculator (calc-engine)
  - [ ] 5.1 `compare()`, validation, `formatUsd`; goldens G1a–G4
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 5.2 `forecastBills()` and `trim()`; goldens B1–B4 and T1
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.4_

- [ ] 6. Build the data layer (release)
  - [ ] 6.1 zod schemas for all five JSON files, `loadAll()`, copy-and-validate script
    - _Requirements: 7.1, 7.4_

- [ ] 7. Build the interface (ui-builder with the teammate)
  - [ ] 7.1 Four cards, drawer and every state on fixtures; `next build` passes
    - _Requirements: 1.1, 3.1, 3.5, 5.1, 7.2_
  - [ ] 7.2 Town picker with search and the map
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ] 7.3 Wire real data through `loadAll()`; demo presets; gate G-UI passes; confirm inputs are not stored
    - _Requirements: 7.1, 7.3, 7.4_

- [ ] 8. Write copy and claims (copy-compliance)
  - [ ] 8.1 `strings.ts`, `docs/claims.md`, sources S14–S16 in `research/sources.md`; G-CLAIMS passes
    - _Requirements: 1.3, 3.4, 4.4, 7.2_

- [ ] 9. Verify independently (verifier)
  - [ ] 9.1 Verifier pass #1 (16:30): recompute by hand, bad inputs, labels, screens, offline, ownership
  - [ ] 9.2 Fix blockers and majors by the owning agent
  - [ ] 9.3 Verifier pass #2 (18:00); G-VERIFY passes
  - _Requirements: 8.2_

- [ ] 10. Deliver and submit (release, then the team)
  - [ ] 10.1 Final deploy, phone test, fallback recording; push from Kiro; latest commit visible on GitHub
    - _Requirements: 8.1, 8.3_
  - [ ] 10.2 Fill `docs/KIRO.md` from `reference/kiro_usage_report.py`; gate G-KIRO passes
    - _Requirements: 8.4_
  - [ ] 10.3 Submit on SundAI at 18:45 and screenshot the "submitted" state (gate G-SUBMIT)
    - _Requirements: 8.3_
