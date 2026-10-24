# Delegation template (the orchestrator pastes this into the delegation message)

```
Use the <agent-name> agent.
GOAL: <one sentence, the outcome, not the activity>
READ: docs/agents/<agent-name>.md, then the files it lists. Do not read other agents' code or summaries.
INPUTS (already exist): <paths>
OUTPUT: only the paths structure.md assigns to <agent-name>, plus the return block from agent-rules.md
DONE WHEN: <gate ids> pass, with the command output pasted
ALREADY RULED OUT: <dead ends, e.g. "the sandbox can't reach mass.gov"; "don't use geoConicConformal on raw GeoJSON">
TIME BOX: <minutes>. At 2x, stop and return STATUS: blocked
STOP IF: <condition, e.g. "contract change needed" -> return a REQUEST instead of editing contracts/>
```

## Wave 1 launch message (paste into the Kiro orchestrator chat after W0b is green AND the orchestrator has run the data and map scripts itself: runbook-saturday.md W1)
```
Run these five agents in parallel now (scaffold committed at <W0b-hash>; data/build/ is populated and G-DATA-1/2/3 + G-GEO are green). Commit only your own paths with `git add <paths>` and a subject prefixed with your agent name; never checkout/switch/stash/reset or `git add -A` (a hook blocks them). Start each from its task in the fairwatt-home spec where possible.
1) Use the calc-engine agent. Spec tasks 3.1, then 3.2. GOAL: checkpoint CP1 only (estimator fit -> estimate_model.json + research/estimator.md). TIME BOX 70.
2) Use the forecaster agent. Spec task 4.1. GOAL: checkpoint CP1 only (shared harness + both leakage tests + K0 + M0). TIME BOX 70.
3) Use the release agent. Spec task 6.1. GOAL: W1 steps only (src/data schemas for all five JSON files + loader + copy-and-validate script). TIME BOX 40.
4) Use the ui-builder agent. Spec task 7.1. GOAL: W1 only: four cards + drawer + all ui.md section 2 states on fixtures; npx next build passes. TIME BOX 120.
5) Use the copy-compliance agent. Spec task 8.1. GOAL: strings.ts + claims.md + S14-S16 in sources.md. TIME BOX 45.
Each returns the standard return block. I run every gate myself at the 13:00 / 14:30 checkpoints and tick the spec tasks.
```

## Why the template looks like this
- Sub-agents start with an empty context and can't ask you questions mid-run. Everything they need must be in the brief or in a file the brief points to. **Decide facts for them** (e.g. Path A vs B) and state them in the message.
- **Already ruled out (paste the relevant ones):** Green Button samples are unreachable (403/404); MassGIS blocks scripts; per-customer EIA kWh is noisy (use sales); numpy is not installed (normal equations); no runtime fetches.
- "Already ruled out" stops agents from re-discovering dead ends we've already paid for (proxy blocks, the winding bug).
- **Why the orchestrator runs data and map scripts itself:** they are four tested shell commands; a sub-agent run for them costs credits and 25–30 minutes for no judgment. Agents are for work that needs reasoning.
- Pointing to files instead of pasting their content keeps briefs short and keeps one source of truth.
