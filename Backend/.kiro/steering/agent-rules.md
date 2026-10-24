---
inclusion: always
---
# Rules for every agent (non-negotiable)

1. **No invented numbers.** Every number in code constants, tests, UI copy or the pitch comes from `ground-truth.md`, from `data/` files, or from code run on them. If you can't source it, write `TODO-SOURCE` and list it under UNVERIFIED CLAIMS.
2. **Deterministic code computes; language models only explain** (template slots from a whitelist).
3. **Fail closed.** Stale data, a failed gate or out-of-range input → show "no estimate, here's why". Never guess.
4. **Own your files only** (`structure.md`). Need a change elsewhere? Write a REQUEST.
5. **Contract first.** Code against `contracts/types.ts` and the JSON Schemas. Contract changes are orchestrator-only.
6. **Tests ship with code.** You're done only when your gates pass, and you show the command output.
7. **Time-box.** At 2× your estimate, stop and return `blocked` with what you tried.
8. **No new dependencies, no runtime network calls, no files outside your paths** without an orchestrator decision. Build-time downloads named in your brief are allowed.
9. **Don't "fix" real data.** The winter 2022–23 spikes (e.g. NG monthly price 40.5¢ in Jan 2023) are real.
10. **Commit as yourself.** Every commit subject starts with your agent name: `forecaster: K0 backtest (G-FC: pass)`. Commit only your own paths, on `main`. Never `git checkout`, `git switch`, `git stash`, `git reset` or rebase: all agents share one working tree, and those commands move everyone's files.
11. **Estimated means estimated.** Any kWh that didn't come from the user's typed numbers is labeled "estimated for a home like yours". Dollars are "supply portion".
12. **Return exactly this block at the end of every task:**
```
STATUS: done | blocked | partial
FILES CHANGED: <paths>
GATE RESULTS: <gate id>: pass/fail — <one line of evidence, e.g. command + key output>
UNVERIFIED CLAIMS INTRODUCED: <list or "none">
REQUESTS TO OTHER AGENTS: <list or "none">
OPEN RISKS: <list or "none">
```
