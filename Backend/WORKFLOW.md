# FairWatt Home: sub-agent build workflow (v3, Oct 24 2026)

This is the master plan. The detail lives in the linked files; this page tells the orchestrator **what runs when, who owns what, and what "done" means**.
Tags: **[V]** = verified, with a source in `research/sources.md`; **[U]** = unverified. Design rationale: `docs/superpowers/specs/2026-10-23-fairwatt-home-design.md`.

## 1. Product (frozen scope)
A Massachusetts household energy planner:
- **Input:** town, home size / age / type / heating; optionally monthly kWh from bills and the supply rate from a bill.
- **Output:** monthly kWh for a home like yours (with a band), your next six supply bills across the Feb 1 2027 reset (with two honest backtest badges), and what you'd pay on basic service instead, both directions, plus a trim scenario.
- **Honesty:** "estimated for a home like yours" until the user types ≥ 3 months; dollars are the supply portion. No one's private data is fetched; account linking is the production path, not today's code.

Details: `.kiro/steering/product.md`, `docs/specs/*`.

## 2. What is already done (don't redo it)

| Asset | Status | Where |
|---|---|---|
| 22 years of residential rate history, 4 utilities | [V] G-DATA-1 PASS | `data/snapshot/`, `docs/apis/01-massgov-basic-service-xlsx.md` |
| MA usage data: 552 RECS 2020 homes + 200 months of EIA-861M | [V] G-DATA-3 PASS; extractor deterministic; re-derives ground truth | `data/snapshot/`, `reference/ingest_usage.py`, `reference/verify_usage.py`, `docs/apis/08-eia-usage-data.md` |
| Estimator signal (fit R² 0.34; size, electric heat, apartment matter) and seasonal shape | [V] computed Oct 23 | `.kiro/steering/ground-truth.md` |
| Usage forecast baseline (same month last year: 5.9% MAPE on sales) | [V] computed Oct 23 | ground-truth.md; `docs/specs/bill-forecast.md` |
| XLSX rate parser | [V] byte-identical round-trip | `reference/ingest_rates.py`, `test_ingest.py` |
| 351-town map paths, 108 KB raw / 37 KB gzip | [V] built + visually checked | `reference/build_geo.mjs`, `docs/specs/img/` |
| H1 evidence for the rate forecast (+0.9%, 140 terms) | [V] reproduced Oct 23 | `research/h1_precheck_output.txt`, `docs/specs/forecast.md` §3 |
| Contracts 1.2.0 (TS types + 5 JSON Schemas) | [V] schemas self-check; types compile with pinned tsc 5.9.3 | `contracts/` |
| Kiro agent configs + steering; Claude Code mirrors | Generated from one table; JSON agents confirmed in Kiro docs; **smoke test in your IDE pending [U]** | `.kiro/`, `.claude/`, `reference/gen_agents.py` |
| Commit-based ownership checker (G-OWN) | [V] tested on a throwaway repo with planted violations | `reference/check_ownership.py` |
| Project scaffold | [V] `npm ci` + build + vitest re-run Oct 23 on TC's Mac (Playwright not re-run) | `scaffold/`, `docs/ops/scaffold.md` |

## 3. Agents (orchestrator + 6 working agents + 2 on standby)

| Agent | Brief | Owns (summary) | Main gate | Estimate |
|---|---|---|---|---|
| orchestrator (TC, in Kiro) | `docs/agents/orchestrator.md` | contracts, scope, gates, wave checks, cuts | all | — |
| data-ingest (standby) | `docs/agents/data-ingest.md` | rates.json, recs_ma.csv, eia_ma_monthly.csv; **the orchestrator normally runs the scripts itself** | G-DATA-1/2/3 | 5 min by script |
| geo-map (standby) | `docs/agents/geo-map.md` | towns.json (town picker); **orchestrator runs the script** | G-GEO | 5 min by script |
| calc-engine | `docs/agents/calc-engine.md` | estimator (fit + evaluate), bill math, trim, rate calculator | G-EST, G-CALC | 2 h (3 checkpoints) |
| forecaster | `docs/agents/forecaster.md` | usage_forecast.json (K0/K1), forecast.json (M0–M2), backtest.md | G-FC | 3 h (3 checkpoints) |
| ui-builder (+ teammate) | `docs/agents/ui-builder.md` | app/, src/ui/ | G-UI | 3.5 h |
| copy-compliance | `docs/agents/copy-compliance.md` | strings.ts, claims.md, sources.md | G-CLAIMS | 45 min |
| verifier (independent) | `docs/agents/verifier.md` | tests/e2e, verification.md | G-VERIFY | 45 + 20 min |
| release | `docs/agents/release.md` | data loader + zod schemas (W1), deploy, DEMO.md, SUBMISSION.md | G-REL | 40 min W1 + 30 min deploy |
| *(human)* | `docs/ops/l1-human-task.md`, `docs/ops/submission.md` | town→utility layer (optional), SundAI submission | G-LAYER, **G-SUBMIT** | 30 + 15 min |

Exact path ownership: `.kiro/steering/structure.md`. Gate commands: `docs/ops/gates.md`.

## 3b. How we use Kiro (judged; evidence in `docs/KIRO.md`, gate G-KIRO)
| Kiro feature | Role here | Where |
|---|---|---|
| Steering | Facts, ownership and rules every agent loads | `.kiro/steering/` |
| **Spec** | The plan: EARS requirements, design, 34 tasks tagged with their agent; the orchestrator delegates by task number and ticks boxes | `.kiro/specs/fairwatt-home/` |
| Custom agents + sub-agents | Parallel workers by `description`, independent verifier | `.kiro/agents/` |
| **Hooks** | `guard-git` (PreToolUse) protects the shared tree; `validate-build` (PostFileSave) schema-checks data files on save; `review-on-save` (PostFileSave) type-checks + runs vitest (60s guard) and injects an agent bug review on any `.ts`/`.tsx`/`.py` save | `.kiro/hooks/` |
| Autopilot + trusted commands + Auto model | No stalls on approvals; fewer credits per prompt | runbook setup |
| Agent-prefixed commits | The log is the usage evidence | `reference/kiro_usage_report.py` |
**Credit discipline:** scripts for deterministic work, agents for judgment; spec pre-written; tasks started from the Specs pane; credits logged at every checkpoint. **Trust the workspace** first or none of this loads.

## 4. Timeline (`docs/ops/runbook-saturday.md`)
08:00 check-in: Gate 0 in person, Kiro code, credits baseline, smoke test → 09:40 fit check during the rules talk → 10:40 roles + L1 human task (+ W0b if pre-built code is allowed) → **11:30 hacking begins** → W0b → **W1 ≈ 11:50–14:30** (through lunch) → **W2 14:30–16:30** (cut decision 16:00) → verify #1 16:30 → fixes → verify #2 18:00 → **freeze 18:30** → **G-KIRO** (KIRO.md from the repo) → **G-SUBMIT 18:45** → pitch → **lock 20:00**.

## 5. Dependency graph
```
data-ingest ──┬──> calc-engine CP1 (estimator fit) ──> estimate_model.json ──┐
              ├──> forecaster (K0/K1, M0–M2) ──> usage_forecast.json, forecast.json ─┤
              │                                    calc-engine CP2/CP3 ──> estimate(), forecastBills(), trim(), compare() ─┤
geo-map ──────┴──> towns.json ─────────────────────────────────────────────────────────┼──> ui-builder (real data) ──> verifier ──> release ──> G-SUBMIT
copy-compliance ──> strings.ts, claims.md ─────────────────────────────────────────────┘
ui-builder (fixtures) and release (loader) start at once, coding against contracts/types.ts
```
calc-engine and forecaster can start before data-ingest finishes: they read `data/snapshot/` directly (same bytes).

## 6. Rules that make this fast AND accurate
1. **Contracts first.** Everyone codes against `contracts/`, so the UI never waits for the data.
2. **Disjoint ownership + commit-prefixed G-OWN.** Kiro sub-agents share one working tree, so ownership is checked per commit at each wave boundary.
3. **Verified ground truth in steering**, re-derived by the gate scripts. Agents can't invent numbers, and a typo in the steering fails a gate.
4. **Tested reference scripts.** The riskiest data tasks (XLSX quirks, map projection, RECS/EIA extraction) are solved; agents port, not rediscover.
5. **"Already ruled out" in every delegation** (`docs/ops/delegation-template.md`).
6. **An independent verifier with blocking power.**
7. **Ship rules decide both forecast labels mechanically.** An honest "no-skill" / "seasonal-only" beats an inflated claim.
8. **"Estimated" stays on screen** until the user's own numbers replace it.
9. **Cut list decided in advance** (`docs/ops/cut-list.md`).
10. **Submission is a gate**, not an afterthought (G-SUBMIT at 18:45).
11. **Kiro use is a gate too** (G-KIRO): the repo itself shows the spec, hooks, steering and who committed what.

## 7. Open items
`research/open-questions.md`. Most important today: Q1 (pre-built code allowed?), Q2 (judging weights; Kiro use), Q13 (credits per sub-agent run), Q16 (does the git hook block?), Q17 (does the Specs pane show our spec?).
