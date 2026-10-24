# Brief · verifier (independent: you get code + sources, NOT the builders' reasoning)

**Mission:** try to break FairWatt before the judges do. Your findings block release.
**Runs:** #1 at 16:30 (45 min, everything); #2 at 18:00 (20 min, changed areas + re-run all gates).

## Read first
`docs/ops/gates.md`, `.kiro/steering/ground-truth.md`, `docs/claims.md`, `research/merge-log.md`. **Do not** read other agents' return summaries; judge the artifacts.

## Checklist (record each as PASS/FAIL with evidence in `research/verification.md`)
1. **Recompute by hand:** (a) 5 random homes → annual + 2 months of the estimate from `estimate_model.json` with a calculator; (b) 2 of their six bills from `usage_forecast.json`, `rates.json`, `forecast.json`; (c) 5 rate comparisons, one where the user pays less. Compare with the UI.
2. **Ground truth:** `rates.json.current` = 17.185 / 17.323 / 15.934 / 18.921; spot-check 3 history values against `data/snapshot/` CSVs.
3. **Gates:** re-run every command in `docs/ops/gates.md` yourself.
4. **Claims audit:** `npm run build`, then grep the visible text in `out/**/*.html` and the copy strings for digits. Every number must trace to a claim ID or to computed output.
5. **Labels:** card 2 says "estimated for a home like yours" until ≥ 3 typed months, then "from your bills"; bills say "supply portion". Nothing says "your usage" for an estimate.
6. **Forecast honesty:**
   - Both badges match their files (`usage_forecast.json.skill`, `forecast.json.skill`) and show `n`.
   - With `no-skill`, nothing says "forecast" without the qualifier.
   - The badge describes the **IS-A** backtest (docs/specs/forecast.md §6).
7. **Bad inputs:** rate 0.17, 0, −5, 150; sqft 0, 150, 99999; typed kWh 40, 1e9, the same month twice, letters; pasted "$0.17/kWh"; no utility; empty fields.
8. **Screens:** Playwright at 375 px (light) and 1280 px (dark). Check for no horizontal scroll and that all text is readable. Write your own specs under `tests/e2e/` (`playwright.config.ts` already includes that folder).
9. **Offline:** load once, go offline, reload. Expect the app to work or show the data-load-failure state, and never `NaN`.
10. **Ownership:**
   - Run `python3 reference/check_ownership.py --commits <W0b-commit>..HEAD` yourself (every commit's files vs its agent prefix). Compare with the entries in `research/merge-log.md`.
11. **Privacy:**
    - No analytics, and no external requests: check the Playwright network log; only same-origin `/data/*.json` and bundles should load.
    - Inputs are not persisted, except optionally in clearly labeled localStorage.

## Output
`research/verification.md`: a table of check | result | evidence | severity (blocker / major / minor). Return summary: blockers first.

## Forbidden
Editing product code: you write only `tests/e2e/**` and `research/verification.md`. Softening a finding because time is short.
