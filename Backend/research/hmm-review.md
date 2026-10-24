# Review — 3-state HMM energy-use regime model (backend-only)

Scope: commit `b1618a4` on `feat/option-dashboard`. Reviewed the diff (8 new files,
2093 insertions), the committed artifact `data/build/hmm_regimes.json`, the schema doc
`research/backend-hmm.md`, against `research/hmm-plan.md` and the original task.

## Verification evidence (from commit message, not re-run)
- `python3 -m src.hmm.hmm_build` -> wrote `data/build/hmm_regimes.json`
- `python3 -m pytest tests/hmm -q` -> 8 passed
- `python3 reference/verify_usage.py ... -> G-DATA-3: PASS`
- Both engine paths exercised: hmmlearn (means 523.4/632.7/705.0, 84 EM iters, converged)
  and numpy-fallback (means 495.3/576.2/705.5, 81 iters, converged, rows sum to 1,
  log-likelihood non-decreasing).

Required test evidence is present, so I did not re-run the suite. I ran one narrow
spot-check parsing the committed artifact to confirm invariants.

## Requirement checks

- Exactly 3 states: PASS. `n_states=3`; artifact `states` has 3 entries; path uses indices
  0-2 (`test_exactly_three_states_and_valid_path`). Spot-check confirmed 3 states.
- GREEN<GREY<RED mean ordering: PASS. `map_regimes` sorts by ascending mean
  (`np.argsort`, stable) and remaps all arrays. Artifact means `[523.45, 632.71, 704.97]`
  are strictly ascending with regimes `[GREEN, GREY, RED]`.
- Transition matrix rows sum to 1: PASS. Spot-check: all three rows sum to 1.0 to 9 dp.
  Covered by `test_transition_rows_sum_to_one`.
- Deterministic seed present: PASS. `SEED = 42` module constant; hmmlearn `random_state=42`,
  numpy fallback `np.random.default_rng(42)`. Artifact records `seed: 42`.
  `test_determinism_same_seed_same_means` asserts identical means within 1e-9.
- hmmlearn / numpy-fallback path documented: PASS. `try: import hmmlearn ... except
  ImportError` selects the engine; `engine` field recorded in artifact and documented in
  `backend-hmm.md`. Fallback implemented in `hmm_model.py` (log-space forward-backward +
  Viterbi).
- JSON artifact has all required fields and parses: PASS. Spot-check: no missing fields from
  the required set (schema_version, source, unit, engine, seed, n_states, converged,
  log_likelihood, log_likelihood_trajectory, states, regime_mapping, transition_matrix,
  stationary_distribution, timeline). State params (means/variances), green/grey/red mapping,
  decoded timeline (200 entries, one per month, each regime consistent with its state via
  `regime_mapping`), and transition probabilities all present. Stationary distribution sums
  to 1.0.
- Functions pure/importable: PASS. `hmm_series`, `hmm_model` contain no file I/O or printing;
  all I/O isolated in `hmm_build` (`build_artifact`) behind a `__main__` guard. Imports
  resolve (tests import `fit_regimes`, `map_regimes`, `load_eia_series`, `build_payload`,
  `build_artifact`).
- No forbidden files touched: PASS. Diff touches only `src/hmm/*`, `tests/hmm/*`,
  `data/build/hmm_regimes.json`, `research/backend-hmm.md`. No `contracts/`, `.kiro/hooks/`,
  `scaffold/`, `package.json`, nor any `stats_*/savings_*/map_*/forecast_mc_*/allcities_*`
  siblings.
- File naming respects hmm_* namespace: PASS. All source files are `hmm_*`; doc is
  `backend-hmm.md`; artifact is `hmm_regimes.json`.

## Additional correctness notes (non-blocking)
- `log_likelihood_trajectory` in the committed artifact is non-decreasing (min step
  +7.8e-5 over 84 iters), matching the schema contract.
- Viterbi path remap `old_to_new[path]` in `map_regimes` is index-correct; the inverse
  permutation is built explicitly from the ascending-mean `order`.
- numpy-fallback `converged` is a heuristic (last EM delta < TOL); it is not on the committed
  artifact path (hmmlearn ran, `converged` taken from the monitor) and the commit records the
  fallback converged. Not a reachable failure.

## Verdict
No blocking findings. All task requirements and plan checks are satisfied, and the recorded
verification evidence is complete.
