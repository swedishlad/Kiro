# Failure playbook

| Symptom | Likely cause | Do this |
|---|---|---|
| G-DATA-1 fails on a new XLSX | Mass.gov changed the layout or added rows | Expected if new rows were added (docs/apis/01 §5). If *history* changed: stop, diff it, ask the orchestrator; fall back to the snapshot |
| `ingest_rates.py`: "non-numeric rate cell" | New text quirk | Print the cell; extend `num()` only for whitespace/format, never for real text like "n/a" in residential columns |
| All towns have the same centroid / paths are huge | Spherical projection on RFC 7946 rings (the known bug) | Use `reference/build_geo.mjs` unchanged (planar EPSG:26986) |
| mapshaper `-proj EPSG:26986` fails | Version drift | Pin `mapshaper@0.7.82` exactly |
| Kiro ignores every agent, steering file and skill | **Workspace not trusted** | Trust the workspace (prompt at open, or workspace trust settings); restart the chat |
| Sub-agent ignores the rules or ground truth | Steering not loaded for custom agents | Check `resources` includes `file://.kiro/steering/**/*.md` (docs/apis/04 §3) |
| Every shell command asks for approval; parallel agents stall | Commands not on the trusted list | Add the patterns from the runbook (`python3 *`, `node *`, `npm *`, `npx *`, `git add *`, `git commit *`, …) in permissions settings |
| An agent waits after every edit | Supervised mode | Switch to Autopilot |
| `git stash` was not blocked by `guard-git` | PreToolUse exit-code contract differs (Q16) | Hook is advisory: rely on agent-rules #10, run `git status` after each wave, record in KIRO.md |
| Specs pane doesn't show `fairwatt-home` (Q17) | Folder or format not recognized | Quick Spec from the design doc; copy our tasks.md over; or tick tasks in the file by hand (the repo is the evidence) |
| `validate-build` hook never fires | File hooks fire only for the agent's own edits | Run `python3 .kiro/hooks/validate_build.py` yourself at each wave boundary |
| Sub-agent edits someone else's files | Brief not followed | G-OWN catches it at the wave boundary; `orchestrator: revert …` commit; re-brief with the violation output |
| Agent ran `git checkout`/`reset`/`stash` and files moved | Shared working tree | Stop all agents; `git reflog` to find the last good state; restore files only (no history rewrite); re-brief with agent-rules #10 |
| Two agents need the same file | Ownership gap | Orchestrator assigns one owner, updates structure.md + CHANGELOG |
| Forecast beats naive "too well" | Leakage | Run the leakage test; check that δ̂ uses only past terms; check the IS-A cut date |
| Forecast doesn't beat naive | Normal possibility | Ship M0 / K0 with the "no-skill" / "seasonal-only" label. That's an honest, demo-able result: "resets are ±X% and nobody can call them; here's your exposure" |
| Estimator coefficients far from 5.302 / 0.469 / 0.420 / −0.326 | Wrong weights, wrong log, or wrong filter | Re-check `NWEIGHT` weighting, ln of `TOTSQFT_EN` and `KWH`, MA filter (552 rows) |
| Estimated bills look absurd (e.g. $0 or $2,000/mo) | Units: kWh vs MWh, cents vs dollars | Supply $ = kWh × ¢/kWh ÷ 100; S15 sales are MWh (× 1000 for kWh) |
| Kiro sub-agents unavailable or flaky | Product or account issue | One session; paste `docs/agents/<name>.md` as the prompt; run agents sequentially in wave order |
| Kiro credits running low (check at each checkpoint) | Usage; 2,000 per person | Spend order: data-ingest → calc-engine → forecaster → ui-builder → verifier. Cut-list from the top. Humans write copy and polish; a teammate's credits can run a second Kiro session on the UI |
| Vercel deploy fails | Config or CLI | Git integration instead of CLI; or any static host for `out/`; worst case, demo from `npx serve out` locally + the recording |
| Venue Wi-Fi dies | — | Phone hotspot; the app is static and small; fallback recording |
| Behind at 16:00 | — | `cut-list.md` from the top; no debate |
| Challenge prompt doesn't fit (W0 score 0) | — | Re-scope with the team by 10:40; keep the data/estimator/verifier machinery; re-use the briefs' structure |
| SundAI submission flow fails or is confusing | Platform | Ask the campus host / facilitators (6:30–8 PM) **before 19:30**; keep the screenshot of whatever you did submit |
