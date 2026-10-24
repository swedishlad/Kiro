---
inclusion: always
---
# Structure and file ownership

Each path has exactly one owner (or `a / b` = either may commit). **Edit only your own paths.** To change someone else's file, put a request in your return summary.
`reference/check_ownership.py` enforces this table (gate G-OWN). The most specific pattern wins, so `public/data/**` beats `public/**`.

| Path | Owner |
|---|---|
| `WORKFLOW.md`, `README.md`, `CLAUDE.md`, `.gitignore`, `contracts/**`, `.kiro/**`, `.claude/**`, `docs/**` | orchestrator |
| `package.json`, `package-lock.json`, `.npmrc`, `tsconfig.json`, `next-env.d.ts`, `vitest.config.ts`, `playwright.config.ts` | orchestrator |
| `research/CHANGELOG.md`, `research/open-questions.md`, `research/merge-log.md`, `research/claims-seed.md`, `research/h1_precheck_output.txt` | orchestrator |
| `reference/**`, `data/snapshot/**`, `scaffold/**` | orchestrator (frozen: change only with a CHANGELOG entry) |
| `data/raw/**`, `research/map_layers.md`, `data/build/layers/**` | human (TC) |
| `data/raw/mass-municipalities.geojson`, `scripts/build_geo.*`, `data/build/towns.json`, `data/build/towns.preview*`, `tests/geo/**` | geo-map / orchestrator |
| `scripts/ingest_*`, `scripts/build_towns.*`, `data/build/rates.json`, `data/build/*_residential_cents.csv`, `data/build/recs_ma.csv`, `data/build/eia_ma_monthly.csv`, `data/build/eia_ma_total_monthly.csv`, `data/build/isone_ma_daily.csv`, `data/build/ma_towns.csv`, `tests/data/**` | data-ingest / orchestrator |
| `backend/stats/**`, `data/build/stats.json`, `tests/backend/stats/**`, `research/stats.md` | stats-engine |
| `backend/regimes/**`, `data/build/regimes.json`, `tests/backend/regimes/**`, `research/regimes.md` | regime-model |
| `backend/forecast/**`, `src/engine/forecast/**`, `data/build/mc_forecast.json`, `data/build/forecast.json`, `data/build/usage_forecast.json`, `tests/backend/forecast/**`, `tests/forecast/**`, `research/backtest.md` | forecaster |
| `backend/towns/**`, `data/build/towns_metrics.json`, `tests/backend/towns/**`, `research/towns.md` | city-model |
| `src/engine/calc.ts`, `src/engine/validate.ts`, `src/engine/format.ts`, `src/engine/estimate/**`, `src/engine/household/**`, `data/build/estimate_model.json`, `tests/engine/**`, `research/estimator.md` | calc-engine |
| `app/**`, `src/ui/**`, `public/**`, `tests/ui/**` | friend / ui-builder |
| `src/copy/**`, `docs/claims.md`, `research/sources.md` | copy-compliance |
| `tests/e2e/**`, `research/verification.md` | verifier (**never edits product code**) |
| `next.config.js`, `vercel.json`, `src/data/**`, `scripts/copy-and-validate-data.ts`, `public/data/**`, `docs/DEMO.md`, `docs/SUBMISSION.md` | release |

## Notes
- **Backend layout:** Python build scripts live in `backend/<area>/` (run with `python3 -m backend.<area>.build` or `python3 backend/<area>/build.py`) and write `data/build/*.json`. Browser functions live in `src/engine/`. The friend's UI lives in `app/` and `src/ui/` and reads `public/data/*.json` (release copies `data/build/*.json` there).
- **Fixtures for the friend:** release writes schema-valid fixtures into `public/data/` at the start of W1 so the UI can be built before the real files land; real files overwrite them.
- **Two owners (`a / b`):** either may commit those paths. The orchestrator runs the tested data, town and map scripts itself (≈ 5 min, no credits); `data-ingest` and `geo-map` are launched only when a script fails.
- **Scaffold exception:** at W0b the orchestrator copies `scaffold/` into the repo root in one commit prefixed `orchestrator:`. It is the only commit exempt from G-OWN.
- **Build-time downloads named in a brief** are allowed. agent-rules #8 forbids *runtime* network calls and unlisted ones.
- **Dependencies:** Python uses the standard library + numpy (2.1.3 present) only; no pip installs on event day. Only the orchestrator edits `package.json`.
- **Git (Kiro sub-agents share one working tree):** everyone works on `main`. **Every commit subject starts with the author's name** (`regime-model: HMM fit (G-HMM: pass)`, `friend: hero section`). G-OWN maps each commit's files to that prefix (`docs/ops/git-and-merge.md`).
