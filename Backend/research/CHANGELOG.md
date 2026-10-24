# Changelog (decisions and corrections; newest first)

## 2026-10-24, later (kit v3.1: Kiro-optimized; TC: Kiro use is among the most important judging criteria)
- **Kiro Spec added** (`.kiro/specs/fairwatt-home/`): 8 requirements with EARS criteria tied to the golden vectors, design with a data-flow diagram, 34 tasks tagged by agent. Pre-written from the design doc (no credits spent generating it). Folder path and Specs-pane pickup unconfirmed (Q17).
- **Hooks added** (`.kiro/hooks/`): `guard-git` (PreToolUse; scripts tested on 12 command strings) and `validate-build` (PostFileSave; schema + ordering + share-sum checks, tested on good and bad files). Whether a PreToolUse command can block via exit code 2 is **unverified** (Q16), so the smoke test checks it.
- **Credit discipline:** the orchestrator runs the tested data and map scripts itself (data-ingest and geo-map become standby); `check_ownership.py` accepts two owners (`a / b`) for those paths; W1 launches 5 agents instead of 7; Auto model; start tasks from the Specs pane.
- **Evidence:** `reference/kiro_usage_report.py` (report, `--write`, `--check`) and gate **G-KIRO** make Kiro use checkable from the repo; `docs/KIRO.md` template. Tested in throwaway repos: passes with real evidence, fails for each missing piece.
- **Setup traps found in Kiro's docs:** an untrusted workspace silently loads no custom agents, steering or skills; Supervised mode would stall parallel agents; shell commands need an allow-list. All now in the runbook, smoke test and playbook.
- Hooks and spec-task runs consume credits (2025 pricing posts; subagent metering undocumented, Q13).
- The `.claude/` mirror and `CLAUDE.md` should not ship in the submitted repo (README install step).

## 2026-10-24 (kit v3: FairWatt Home)
- **Product re-scoped** from FairWatt Lite (rate check) to **FairWatt Home** (usage estimate + six-bill forecast + rate check), per TC's idea of a per-house energy analyzer/forecaster. Design: `docs/superpowers/specs/2026-10-23-fairwatt-home-design.md`. Rate data, forecast method, map, calculator, gates and verifier carry over.
- **Correction (event facts, S16 supersedes S7):** the official page states Kiro is required for vibe-coded projects, teams ≤ 4, hacking begins **11:30** (not 09:00/09:35), lunch 12–1, submission = SundAI card + GitHub repo by 8 PM sharp, finalists at midnight. Judging criteria and pre-built-code rules remain unstated. Runbook re-cut; G-SUBMIT added.
- **New data [V]:** RECS 2020 MA (552 homes, S14) and EIA-861M MA residential (200 months, S15), frozen in `data/snapshot/` with `reference/ingest_usage.py` + `reference/verify_usage.py` (G-DATA-3). Source IDs S12/S13 were already taken (Next.js, npm), so the new sources are S14/S15 (never renumber).
- **Finding:** EIA customer counts jump ±3–10% month to month (26 of 200 months > 2%, Final months included). Seasonal shape and the usage forecast use total sales, not kWh per customer.
- **Finding:** MA residential usage peaks in July–August as high as in January (peak/trough 1.53). The app never hard-codes "winter".
- **Correction:** my Oct 23 note called the RECS median 6,650 kWh "weighted"; it is the unweighted median (6,649). Four weighted medians were truncated instead of rounded (10,596 → 10,597; 5,615 → 5,616; 8,147 → 8,148; 6,091 → 6,092). `verify_usage.py` now re-derives them.
- **Git protocol:** one branch per agent replaced by one branch + agent-prefixed commits, because Kiro sub-agents share one working tree. `check_ownership.py` gained `--commits` and `--owner-of`.
- Agents: `layer-research` dropped (L1 is a 30-min human task, `docs/ops/l1-human-task.md`); calc-engine owns the estimator and bill math; forecaster owns both forecasts. Contracts 1.2.0 (+ `estimate_model.schema.json`, `usage_forecast.schema.json`).
- Steering front matter (`inclusion: always`) was dropped by a rewrite and restored the same morning.

## 2026-10-23
- Kit v2 created (this folder): steering, agent configs, contracts, API guides, specs, ops docs, reference scripts, verified data snapshot.
- **Correction:** the map build in the v1 workflow (d3 `geoConicConformal` on raw GeoJSON, 697 KB) was broken. The winding order made every town render as the globe minus the town. Fixed: planar EPSG:26986 in mapshaper + `geoIdentity` → 101 KB raw / 34 KB gzip, 351 distinct centroids, visually checked (108 KB / 37 KB after adding the `census` field, below).
- **Correction:** the v1 workflow listed 4 irregular terms from a hand count; the parser finds **13**. See data-dictionary.md.
- **Finding:** H1 holds well in-sample (140 terms since 2010: median +0.92%, 86% within ±3%). Reset sizes are large (mean absolute simple change 16–27% by utility; an earlier draft quoted log changes as % and has been corrected).
- Decision: Kiro agents defined as JSON (documented fields) rather than Markdown (front-matter keys undocumented on the pages we read).
- Decision: every custom agent loads steering via `resources` (Kiro does not load steering for custom agents automatically, per S11).
- Decision: pinned versions ≥ 14 days old (docs/apis/03), **except** security fixes and versions that fail to install.
- **Security:** `npm audit` flagged next ≤ 16.4.0 (critical RCE advisories GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr; DoS GHSA-p3m5-59mp-jv5r). Pinned **next 16.4.2**; audit is clean.
- **Install bug:** vitest 5.0.3 / 5.0.4 fail with npm 10.9.4 (`edgesOut`); pinned **vitest 5.0.5**.
- Added `scaffold/` (tested: fresh `npm ci`, static build, vitest, Playwright 2/2, 0 vulnerabilities). The test caught a missing favicon (a 404 console error would fail G-UI) and a stale-server risk (`reuseExistingServer` set to false).
- Contracts 1.1.0: `ValidationIssue` + `UTILITY_MISSING`, `DATA_STALE`; `Town.census` (mixed-case name for search). towns.json is now 108 KB raw / 37 KB gzip.
- Independent review (29 findings) applied:
  - Gate 0 fallback no longer breaks the gates.
  - Scaffold step W0b added.
  - Phase-specific build command.
  - Ownership table rewritten (root configs, `src/data`, `tests/ui`, `research/sources.md`, `data/raw/mass-municipalities.geojson`).
  - Merge log for G-OWN.
  - Timeline made consistent (cut decision 15:30; verify #2 18:00–18:30).
  - Forecaster checkpoints.
  - IS-A drives the badge.
  - ASCII minus.
  - Simple-% reset sizes.
  - Verbatim AG wording.

## 2026-10-22
- Product chosen: FairWatt Lite with forecast + map (Energy track). PeakCall shelved (did not address a Massachusetts problem).
- Rate history sourced from Mass.gov workbook (S1) via an in-browser parse; checksums recorded.
- Boundaries sourced from LMEC (S6).
- v1 single-file workflow written.
