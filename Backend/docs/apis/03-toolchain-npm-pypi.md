# 03 · Toolchain: npm and PyPI packages (pinned)

**Status:** versions and release dates were read from the npm registry on Oct 23 2026, and the full set was **installed and tested together** in `scaffold/` (`npm ci`, build, vitest, Playwright, `npm audit` = 0 vulnerabilities).

**Pinning rule:**
- Use the newest stable release that is ≥ 14 days old on event day. Brand-new releases are where surprise bugs live.
- **Two exceptions beat the rule:**
  1. **Security fixes.**
  2. **Versions that don't install.**
- **No upgrades on Saturday.**

| Package | Pin | Released | Why this version | Role |
|---|---|---|---|---|
| node | ≥ 20.9.0 (tested on 22.22.0) | — | Next 16.4.x `engines` | Runtime |
| next | **16.4.2** | 2026-10-15 | **Security:** 16.0.0–16.4.0 carry critical advisories (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr: RCE; GHSA-p3m5-59mp-jv5r: DoS). 16.4.2 audits clean | App framework (static export) |
| react / react-dom | **19.3.0** | 2026-09-09 | ≥ 14 days; Next peer range `^18.2.0 \|\| ^19.0.0` | UI |
| typescript | **5.9.3** | 2025-09-30 | Mature; 7.x is the native-compiler line, so don't switch toolchains mid-hackathon | Types |
| vitest | **5.0.5** | 2026-10-15 | **Install bug:** 5.0.3 and 5.0.4 fail with npm 10.9.4 (`Cannot read properties of null (reading 'edgesOut')`), reproduced in fresh folders; 5.0.5 installs and runs | Unit/property tests |
| fast-check | **4.10.2** | 2026-09-19 | ≥ 14 days | Property-based tests |
| zod | **4.6.5** | 2026-09-13 | ≥ 14 days | Runtime validation of JSON (release's `src/data/`) |
| @playwright/test | **1.64.0** | 2026-10-07 | ≥ 14 days | E2E and screenshots |
| tsx | **4.23.15** | 2026-09-20 | ≥ 14 days | Runs `scripts/copy-and-validate-data.ts` |
| @types/node | **26.6.5** | 2026-10-09 | ≥ 14 days | Types |
| @types/react | **19.3.0** | 2026-09-09 | Matches react | Types |
| mapshaper | **0.7.82** | 2026-10-09 | ≥ 14 days; `-proj EPSG:26986` tested | Simplify + project boundaries (build time only) |
| d3-geo | **3.1.1** | 2024-03-12 | Stable | Path generation (build time only) |
| vercel (CLI) | **63.1.2** | 2026-10-09 | ≥ 14 days (65.2.0 is from 10-22) | Deploy via `npx vercel@63.1.2`; Git integration is the alternative |
| openpyxl (PyPI) | **3.1.5** | — | Latest | XLSX parse in `ingest_rates.py` |
| jsonschema (PyPI) | **4.26.0** | — | Tested | Validate data files against `contracts/*.schema.json` |

Release dates come from `npm view <pkg> time`. Advisories come from `npm audit` (Oct 23).

## Install
The tested way is **`npm ci` from `scaffold/package-lock.json`** (`docs/ops/scaffold.md`). To recreate it from scratch:
```bash
echo "save-exact=true" > .npmrc
npm i next@16.4.2 react@19.3.0 react-dom@19.3.0 zod@4.6.5
npm i -D typescript@5.9.3 @types/node@26.6.5 @types/react@19.3.0 vitest@5.0.5 fast-check@4.10.2 \
        @playwright/test@1.64.0 tsx@4.23.15 mapshaper@0.7.82 d3-geo@3.1.1
npx playwright install chromium
python3 -m pip install openpyxl==3.1.5 jsonschema==4.26.0
npm audit          # expect: found 0 vulnerabilities
```

Notes:
- `npm ci` prints deprecation warnings for `prebuild-install` and `geographiclib`, which mapshaper pulls in. They're build-time only and never reach the browser.
- **Runtime dependencies stay tiny:** next, react, zod. Map and data processing happen at build time, so the browser never loads mapshaper, d3 or the 18 MB GeoJSON.
- Not chosen:
  - `topojson-*`: unnecessary once paths are pre-projected.
  - Chart libraries: one fan chart and one range bar are easier as hand-written SVG, with full control of light/dark tokens.
  - pytest: Python checks are plain `python3` scripts with `assert`.
