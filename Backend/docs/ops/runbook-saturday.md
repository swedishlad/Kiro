# Saturday runbook (Oct 24 2026), re-cut to the real event schedule and to how Kiro is judged

Event facts (ground-truth.md, from the event page): check-in 8–9 · challenges & rules 9:40–10:00 · Kiro how-to 10:00–10:30 · brainstorm/team formation 10:40–11:30 · **hacking begins 11:30** · lunch 12–1 · dinner 5 · submission window 6–8 PM · **deadline 20:00 sharp** · judging 8–11 PM.
**Kiro use is among the most important judging criteria** (TC, Oct 24; rubric unpublished). So the run is also the evidence: steering, spec, hooks, sub-agents, agent-prefixed commits, credits, `docs/KIRO.md`.
All times are **targets, not measurements**. The orchestrator re-plans at every checkpoint. Agents keep running through lunch.

## 08:00–09:40 · Check-in and Kiro setup (no product code)
- [ ] Student ID; check in on SundAI; confirm your name on the campus list.
- [ ] **Pick up the Kiro credit code** (a physical paper) and redeem it. **Write the starting balance** in `research/CHANGELOG.md`.
- [ ] **Gate 0 (ask a host in person):** (1) pre-built code, data or plans allowed? (2) judging criteria and the **weight of Kiro use**. Record both answers verbatim in `research/CHANGELOG.md`. Act on (1) with `friday-prep.md`'s table.
- [ ] Open `fairwatt-kit` in Kiro and **Trust the workspace** when asked. Until you do, Kiro does not load the custom agents, steering or skills and asks before every shell command (kiro.dev/docs/permissions).
- [ ] **Autopilot ON** (Supervised pauses after every file-editing turn and would stall parallel agents).
- [ ] **Trusted commands** (permissions settings; patterns use `*`): `python3 *`, `node *`, `npm *`, `npx *`, `git status*`, `git diff*`, `git log*`, `git add *`, `git commit *`. Not `git push`, not `npm publish`.
- [ ] **Model:** pick **Auto** for the session (named models cost more credits per prompt, per Kiro's pricing posts); switch only a stalled agent to a stronger model, and note it in `docs/KIRO.md`.
- [ ] Connect the GitHub repo through Kiro (setup guide: a test change must appear on github.com).
- [ ] `python3 reference/verify_snapshot.py data/snapshot/monthly_residential_cents_2026-07-02.csv data/snapshot/fixed_residential_cents_2026-07-02.csv` → PASS and `python3 reference/verify_usage.py data/snapshot/recs_ma_2020.csv data/snapshot/eia_ma_monthly_2026-08.csv` → PASS.
- [ ] **Kiro smoke test** (`docs/apis/04-kiro-agents-and-steering.md` §5, now 8 steps): sub-agents run in parallel; **a `git stash` request is blocked by our hook (Q16)**; the Specs pane lists `fairwatt-home` with its tasks (Q17); credits before and after.

## 09:40–10:00 · W0 Fit check (during the rules talk)
1. Copy the Energy & climate tech challenge text verbatim into `research/CHANGELOG.md`. Note anything said about Kiro in the judging.
2. Does "estimate and forecast a Massachusetts home's electricity use and supply bills, honestly" answer it? Score 0–2.
   - **2:** go. **1:** go, and re-word the pitch's first sentence and the SundAI description to the prompt's language. **0:** re-scope with the team by 10:40; the data, estimator, verifier and scaffold carry over to most energy prompts.
3. Note any new rules (pre-built code, required Kiro usage, submission fields) and apply them.

## 10:40–11:30 · Brainstorm window (humans)
- Team roles: orchestrator (drives Kiro), UI teammate (design calls, `docs/specs/ui.md`), L1 human task (`docs/ops/l1-human-task.md`, 30 min hard stop), pitch/submission owner.
- **If Gate 0 allowed pre-built code:** do W0b now. **If not:** prepare, and do W0b at 11:30.

## W0b Scaffold (orchestrator only, 15–20 min: 10:40 if allowed, else 11:30)
Follow `docs/ops/scaffold.md`: copy, `npm ci`, `npx next build && npm test && npm run e2e`, commit `orchestrator: scaffold (W0b; exempt from G-OWN)`. **Record that commit's hash in `research/merge-log.md`**: G-OWN and G-KIRO count from there. Tick tasks 1.1–1.3 in `.kiro/specs/fairwatt-home/tasks.md`. **No agent starts before this is green.**

## ≈ 11:50–14:30 · W1 Build (parallel; through lunch)
**Orchestrator runs the tested scripts itself first (≈ 5 min, no credits, tasks 2.1–2.2):**
```bash
python3 reference/ingest_rates.py --from-snapshot data/snapshot/monthly_residential_cents_2026-07-02.csv data/snapshot/fixed_residential_cents_2026-07-02.csv data/build/
python3 reference/ingest_usage.py --from-snapshot data/snapshot/recs_ma_2020.csv data/snapshot/eia_ma_monthly_2026-08.csv data/build/
curl -L -o data/raw/mass-municipalities.geojson https://raw.githubusercontent.com/nblmc/massachusetts-municipal-boundaries/main/data-cooked/mass-municipalities.geojson
node reference/build_geo.mjs data/raw/mass-municipalities.geojson data/build/towns.json 300 1
```
then the gates G-DATA-1/2/3 and G-GEO (`gates.md`), commit as `orchestrator: ran ingest + map scripts (G-DATA-1/2/3, G-GEO: pass)`. **Only if a script fails**, launch `data-ingest` or `geo-map` (briefs unchanged).
**Then launch in one message** (template: `delegation-template.md`): calc-engine (CP1), forecaster (CP1), release (W1 only), ui-builder (fixtures), copy-compliance. **Start work from the Specs pane where it lists the task** (cheaper than typing in chat).

| Checkpoint | Expect | If not |
|---|---|---|
| 12:30 | Data and map gates green (orchestrator) | Launch data-ingest / geo-map with the failing output |
| 13:00 | calc-engine CP1: `estimate_model.json` + estimator.md; forecaster CP1: harness + both leakage tests + K0 + M0; release: schemas + loader + copy script. **Credits recorded** | Re-brief with the failing output and a narrower scope |
| 13:45 | calc-engine CP2: `estimate()` + `compare()`, goldens E*/G* | Re-brief; ui-builder keeps using fixtures |
| 14:00 | forecaster CP2: K1 + M1 | Skip M2; ship rules in W2 |
| 14:30 | calc-engine CP3: `forecastBills()` + `trim()`, goldens B*/T1. **G-OWN wave check**; `npm test` + phase build green. **Tick finished tasks; take 3 Kiro screenshots** (Specs pane, parallel sub-agents, hooks list) into `docs/img/kiro/` | Stop and fix the first red build before W2 |

## 14:30–16:30 · W2 Integrate
- ui-builder wires real JSON through release's `loadAll()`.
- forecaster CP3: M2 (if time) → both ship rules → final `usage_forecast.json` + `forecast.json`. **Target 15:30.**
- If L1 passed: ui-builder adds utility prefill.
- **16:00 cut decision:** anything not on track for its gate by 16:30 is cut (`cut-list.md`). Record credits remaining.

## 16:30–17:15 · W3 Verify #1 (45 min)
Launch the **verifier** with only its brief + the repo. Triage: **blocker** fix now · **major** fix, or list under Limits · **minor** backlog.

## 17:15–18:00 · W4 Fix
Blockers and majors **only**, each by the file's owning agent. Release prepares `docs/SUBMISSION.md`.

## 18:00–18:20 · Verify #2 (changed areas + all gates + G-OWN)

## 18:30 · FEATURE FREEZE, then Kiro evidence (15 min)
release: final deploy, phone test, fallback recording, push from Kiro, confirm the commit on github.com. In parallel the orchestrator:
1. ticks the remaining spec tasks (and lists any unticked one in KIRO.md "not done");
2. `python3 reference/kiro_usage_report.py --write docs/KIRO.md --base <W0b-hash>`;
3. fills every `TODO` in `docs/KIRO.md` (credits start/used, what worked, what didn't) and takes the closing screenshots;
4. `python3 reference/kiro_usage_report.py --check --base <W0b-hash>` → **G-KIRO: PASS**; commit `orchestrator: KIRO.md (G-KIRO: pass)`.

## 18:45 · G-SUBMIT (human, 15 min)
SundAI → the Hackachusetts event → create the project card from `docs/SUBMISSION.md` (includes the Kiro paragraph): track **Energy & climate tech**, the correct GitHub repo, the live URL. **Confirm SundAI shows it as submitted.** Screenshot into `research/CHANGELOG.md`. Campus facilitators help 6:30–8.

## 19:00–19:45 · Pitch
Fill `docs/ops/demo-script.md` with the real numbers → `docs/DEMO.md`. Rehearse twice, timed. Say one sentence about Kiro in the pitch ("a spec, five steering files, two hooks, N sub-agents in parallel; the log is in KIRO.md"). If the card can be edited, update it with any late fix (blockers only).

## 20:00 · Lock. Nothing after this counts.
