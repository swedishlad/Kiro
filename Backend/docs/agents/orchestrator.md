# Brief · orchestrator (TC's main session, in Kiro)

**Mission:** ship FairWatt Home and **submit it on SundAI by 18:45** (lock 20:00) with every gate green, by delegating reasoning work to the sub-agents (data and map scripts you run yourself) and never writing feature code yourself while they run.

## You own
Scope, contracts, root configs, `package.json`, wave checks, the cut list, go/no-go calls, all of `docs/` except `docs/claims.md`, `docs/DEMO.md` and `docs/SUBMISSION.md`, plus `research/CHANGELOG.md`, `open-questions.md` and `merge-log.md`. The full table is in `.kiro/steering/structure.md`.

## You personally do (sub-agents can't)
- Anything needing a human or a logged-in browser: Gate 0 with a host, the Kiro credit code, GitHub connection through Kiro, Vercel login, **the SundAI submission (G-SUBMIT)**.
- W0 fit check (09:40) and **W0b scaffold** (`docs/ops/scaffold.md`) before any agent starts. Record the W0b commit hash in `research/merge-log.md`.
- Decide facts sub-agents can't ask about mid-run, and **put them in the delegation message**. Example: "Use Path B (snapshots) for rates and usage."
- Answer every `REQUESTS TO OTHER AGENTS` line within 15 minutes, or the requesting agent stalls.
- Update `reference/verify_*.py` constants if a refreshed source is adopted (docs/apis/01 §5, docs/apis/08 §4). Only you may change `reference/`.
- **Record Kiro credits remaining** at check-in and at 13:00, 14:30, 16:00 in `research/CHANGELOG.md`.

## Kiro practice (judged: docs/KIRO.md, gate G-KIRO)
- **Run the deterministic scripts yourself** (data ingest, map build: runbook W1). Delegate only work that needs reasoning.
- **Work from the spec:** delegate by task number ("Use the calc-engine agent for spec task 3.1"); after each gate passes, tick the task in `.kiro/specs/fairwatt-home/tasks.md` and commit `orchestrator: tick task N`.
- **Autopilot on, workspace trusted, commands allow-listed, model Auto** (runbook setup). Start tasks from the Specs pane when it lists them.
- **Credits at each checkpoint** into `research/CHANGELOG.md`; screenshots at 14:30 and 18:00 into `docs/img/kiro/`.
- At the freeze: `python3 reference/kiro_usage_report.py --write docs/KIRO.md --base <W0b-hash>`, fill every TODO, then `--check` → G-KIRO PASS.

## Delegation protocol
1. Use `docs/ops/delegation-template.md`. Name the agent explicitly ("Use the forecaster agent to …").
2. Launch independent agents **in the same message** so they run in parallel (`runbook-saturday.md` lists them per wave).
3. When a return block arrives:
   - **STATUS done:** run its gate commands yourself. Its commits are checked by G-OWN at the next wave boundary.
   - **partial / blocked:** re-brief with a narrower scope, reassign, or cut (`docs/ops/cut-list.md`).
   - **UNVERIFIED CLAIMS:** each one gets a source (copy-compliance adds it to `research/sources.md`) or gets removed.
4. At each wave boundary (12:30, 14:30, 16:30, freeze): `python3 reference/check_ownership.py --commits <W0b-hash>..HEAD | tee -a research/merge-log.md`, then `npm test` + the phase build (`docs/ops/git-and-merge.md`).

## Decision rules
- If something contradicts `ground-truth.md`, stop that thread and verify. Then update ground-truth.md + CHANGELOG (and the matching constant in `reference/verify_usage.py`, which re-derives it).
- Contract change requests: accept only if the change is additive or the requester is blocked. Bump `contracts/VERSION` and `CONTRACTS_VERSION`.
- **At 16:00, decide cuts.** Anything not on track for its gate by 16:30 is cut. Don't negotiate with sunk cost.
- Verifier findings block release. You may accept a finding as a known limitation only by writing it into `docs/DEMO.md` "Limits" (via release).
- **18:45 is the submission, whatever state the app is in.** A submitted honest app beats an unsubmitted better one.

## Gates you re-run
G-DATA-1, G-DATA-2, G-DATA-3, G-GEO (incl. visual sign-off), G-LAYER (optional), G-EST, G-CALC, G-FC, G-UI, G-CLAIMS, G-OWN, G-REL, G-VERIFY, G-KIRO, G-SUBMIT. Commands are in `docs/ops/gates.md`.
