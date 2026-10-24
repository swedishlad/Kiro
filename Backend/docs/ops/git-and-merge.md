# Git protocol (one branch, agent-prefixed commits)

**Why not one branch per agent:** Kiro sub-agents share the main session's workspace (docs/apis/04 §2). Parallel agents can't sit on different branches of one working tree; a `git checkout` by one moves everyone's files. So everyone works on `main`, and ownership is checked per **commit** instead of per branch.

## Rules
- `main` is the only branch. The repo is the one connected through Kiro (the event checks it).
- **Every commit subject starts with the author's agent name:** `calc-engine: estimator fit (G-EST: pass)`. Allowed prefixes: `orchestrator`, `data-ingest`, `geo-map`, `calc-engine`, `forecaster`, `ui-builder`, `copy-compliance`, `verifier`, `release`, `human`.
- Agents `git add` **only their own paths** (never `git add -A`), then commit. Never `checkout`, `switch`, `stash`, `reset`, `rebase` (agent-rules #10).
- The W0b scaffold commit (`orchestrator: scaffold …`) is the one exemption. Record its hash in `research/merge-log.md`.

## Wave boundaries (12:30, 14:30, 16:30, before freeze)
1. Each agent's gates pass (the orchestrator re-runs them).
2. `python3 reference/check_ownership.py --commits <W0b-hash>..HEAD | tee -a research/merge-log.md` must print `G-OWN commits: PASS`.
3. `npm test` plus the phase build (`npx next build` until release's loader lands, `npm run build` after). If red, the owning agent fixes it before the next wave starts.
4. Uncommitted changes at a boundary: `git status --porcelain -uall | cut -c4- | python3 reference/check_ownership.py --owner-of` lists each file's owner, so stray edits are attributable before anyone commits them.

## Fixing a violation
The orchestrator reverts the offending files in a commit prefixed `orchestrator: revert <files> (G-OWN)` and re-briefs the agent with the violation output.

## Conventions
- `data/build/*.json` **is committed**: the static build needs it and judges can inspect it.
- `data/raw/` is git-ignored (large or third-party files). `data/snapshot/` is committed.
