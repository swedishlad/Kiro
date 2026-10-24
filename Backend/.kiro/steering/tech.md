---
inclusion: always
---
# Tech

- **App:** Next.js **16.4.2** (≤ 16.4.0 has critical advisories; never downgrade) with `output: 'export'` (static), React 19.3.0, TypeScript 5.9.3. Node ≥ 20.9.0.
- **Tests:** vitest 5.0.5 (5.0.3/5.0.4 don't install) + fast-check 4.10.2 (unit/property); @playwright/test 1.64.0 (e2e + screenshots).
- **Validation:** zod 4.6.5 validates every JSON file at load; the JSON Schemas in `contracts/` are the source of truth.
- **Build-time data:** Python 3 + openpyxl 3.1.5 (`reference/ingest_rates.py`, `reference/ingest_usage.py`); mapshaper 0.7.82 + d3-geo 3.1.1 (`reference/build_geo.mjs`). Usage sources: RECS 2020 (S14) and EIA-861M (S15), see `docs/apis/08-eia-usage-data.md`.
- **Backend (decided Oct 24):** Python 3 + **numpy 2.1.3** (scipy 1.15.3 also present) in `backend/<area>/` for the heavy precomputed fields: stats, HMM (hand-rolled Baum–Welch + forward filter; **hmmlearn is not installed, don't pip install**), Monte Carlo, 351-town model. Output: `data/build/*.json`, validated against `contracts/*.schema.json`. Seed every random generator.
- **Interactive fields:** TypeScript pure functions in `src/engine/` (estimate, savedVsBasic, simulateBills, trim, compare) so the UI updates instantly; seeded PRNG for the browser Monte Carlo.
- **Frontend:** TC's friend, from `docs/FRONTEND_CONTRACT.md`. We don't build UI.
- **Build tool on the day: Kiro (required by the event).** Claude Code (`CLAUDE.md`, `.claude/agents/`) is a fallback for planning only.
- **Deploy:** Vercel (Git integration preferred; CLI `npx vercel@63.1.2` as fallback).
- **Pinned versions only.** The project starts from `scaffold/` (`npm ci` from its lockfile; `.npmrc` has `save-exact=true`). No upgrades on event day. Rationale and dates: `docs/apis/03-toolchain-npm-pypi.md`.

## Hard constraints
- **Zero runtime external calls.** The browser loads only `/data/*.json` and the app bundle. No keys.
- Deterministic code computes every number. Any language-model text is template-slot filling only.
- No chart or map libraries at runtime: hand-written SVG; paths are pre-projected at build time.
- Charts: tokens on `:root` with dark-mode overrides; a table fallback under every chart.

## Commands
```bash
python3 reference/verify_snapshot.py data/snapshot/monthly_residential_cents_2026-07-02.csv data/snapshot/fixed_residential_cents_2026-07-02.csv
python3 reference/ingest_rates.py data/raw/<file>.xlsx data/build/
python3 reference/verify_usage.py data/snapshot/recs_ma_2020.csv data/snapshot/eia_ma_monthly_2026-08.csv data/snapshot/eia_ma_total_monthly_2026-08.csv
python3 reference/verify_isone.py data/snapshot/isone_ma_daily_2017-2023.csv
python3 reference/verify_towns.py data/snapshot/ma_towns_2024.csv
node reference/build_geo.mjs data/raw/mass-municipalities.geojson data/build/towns.json 300 1
npm test            # vitest
npm run e2e         # playwright
npm run build       # build:data (copy+validate) then next build -> out/
```
