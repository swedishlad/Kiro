# Implementation Plan — 3-state HMM energy-use regime model (backend-only)

FairWatt MA energy project. Backend Python only; a teammate builds the UI. This workflow produces one
deliverable: a 3-state Gaussian HMM over the monthly MA residential consumption series, written to a committed
static JSON artifact the frontend reads.

## Decisions made during exploration (grounded in the repo)

- **Series to fit on:** `data/snapshot/eia_ma_monthly_2026-08.csv`, column **`kwh_per_customer`** (200 monthly
  observations, 2010-01 … 2026-08, ascending with no gaps — confirmed by `reference/verify_usage.py`). This is
  the cleanest continuous consumption signal. `ground-truth.md` warns customer counts are noisy and seasonal
  peaks hit in summer as hard as winter, so the HMM must find regimes by *level*, not by assuming "winter".
  A quick fit (hmmlearn, `random_state=42`, diag covariance) already converges in 84 EM iterations to 3
  distinct states with means ≈ 523 / 633 / 705 kWh/customer and transition rows summing to 1.0 — the
  deliverable is viable as specified. RECS (`recs_ma_2020.csv`) is a cross-section of 552 homes with no time
  axis, so it is **not** used for the HMM sequence; we note this in the doc. (Rationale: HMM needs an ordered
  series; EIA monthly is the only time series.)
- **Library path + fallback:** `hmmlearn 0.3.3` is installed (verified), so the primary path uses
  `hmmlearn.hmm.GaussianHMM`. We still ship a pure-numpy Baum-Welch/Viterbi fallback for Gaussian emissions so
  the code runs if hmmlearn is ever absent. **Decision point:** at runtime, `try: import hmmlearn` — if it
  imports, use it; on `ImportError`, use the numpy implementation. The artifact records which path ran under
  `"engine"`. (Rationale: task requires graceful fallback and documenting the path taken.)
- **Determinism:** seed with a single module constant `SEED = 42`. hmmlearn path passes `random_state=42`;
  numpy fallback seeds `np.random.default_rng(42)` for its init. Both standardize the input (subtract mean,
  divide by std) only for fitting stability, then report means/variances back in the **original kWh scale**.
  Fixed `n_iter`/`tol` so iteration count and log-likelihood trajectory are reproducible run to run.
- **State → regime mapping:** sort the 3 fitted states by mean consumption ascending and map
  **GREEN = lowest mean (good/low use), GREY = middle, RED = highest mean (too-much use)** — matches the
  user's "green good / grey mid / red too much" direction. All outputs (means, timeline labels, matrices) are
  reported in this sorted canonical order so results are stable across runs regardless of hmmlearn's internal
  state indexing.
- **File placement / ownership:** `.kiro/steering/structure.md` makes `reference/**`, `src/engine/estimate/**`
  and `src/engine/forecast/**` owned by other agents, and `reference/` is frozen. New HMM code therefore lives
  in a **new unowned `src/hmm/` directory** with `hmm_*` filenames, tests in `tests/hmm/`, the artifact at the
  task-specified `data/build/hmm_regimes.json`, and docs at `research/backend-hmm.md`. These avoid the
  stats/savings/map and forecast/montecarlo siblings' prefixes entirely.
- **Git:** the `guard-git` PreToolUse hook (`.kiro/hooks/guard_git.py`) blocks `git add -A`/`git add .` and
  checkout/reset/clean. Stage only our own new files **by name**; commit subjects use an `hmm:` prefix.

## Files this plan creates

- `src/hmm/__init__.py`
- `src/hmm/hmm_series.py` — load the EIA series
- `src/hmm/hmm_model.py` — fit (hmmlearn + numpy fallback), decode, regime mapping
- `src/hmm/hmm_build.py` — build & write `data/build/hmm_regimes.json`
- `tests/hmm/__init__.py`
- `tests/hmm/test_hmm_regimes.py` — pytest assertions
- `data/build/hmm_regimes.json` — committed artifact (build creates `data/build/`)
- `research/backend-hmm.md` — JSON schema doc for the frontend teammate

---

# Implementation Plan

- [ ] 1. Create the series loader `load_eia_series()` in `src/hmm/hmm_series.py` (and `src/hmm/__init__.py`).
      Pure function: read `data/snapshot/eia_ma_monthly_2026-08.csv` with stdlib `csv` reusing the column
      names from `reference/ingest_usage.py` (`year`, `month`, `kwh_per_customer`), return an ordered list of
      `{"period": "YYYY-MM", "value": float}` dicts plus a parallel `numpy` float array of `kwh_per_customer`,
      sorted ascending by (year, month). Accept an optional path argument defaulting to the snapshot so tests
      can inject a tiny fixture. No HMM logic here.
      Files: src/hmm/__init__.py, src/hmm/hmm_series.py
      Verify: `cd fairwatt-kit && python3 -c "from src.hmm.hmm_series import load_eia_series; s,a=load_eia_series(); print(len(s), a.shape)"` prints `200 (200,)`.

- [ ] 2. Create the HMM core in `src/hmm/hmm_model.py` with `SEED = 42` and a `fit_regimes(values, n_states=3)`
      function returning a dataclass/dict with: per-state mean & variance (original kWh scale), the Viterbi
      decoded path, the transition matrix, the stationary distribution (left eigenvector of the transition
      matrix for eigenvalue 1, normalized), the log-likelihood trajectory per EM iteration, a `converged`
      flag, and `engine` (`"hmmlearn"` or `"numpy-fallback"`). hmmlearn path: `GaussianHMM(n_components=3,
      covariance_type="diag", n_iter=200, tol=1e-4, random_state=42)` on standardized input, pulling the
      per-iteration score history from `monitor_.history`; numpy path: a self-contained Gaussian Baum-Welch
      (forward-backward in log space) + Viterbi seeded by `np.random.default_rng(42)`. Choose the path with
      `try/except ImportError`. Add `map_regimes(result)` that sorts states by ascending mean and returns the
      canonical GREEN/GREY/RED mapping plus all arrays re-indexed into sorted order. Keep every function pure
      and importable (no file I/O, no printing).
      Files: src/hmm/hmm_model.py
      Verify: `cd fairwatt-kit && python3 -c "from src.hmm.hmm_series import load_eia_series; from src.hmm.hmm_model import fit_regimes, map_regimes; _,a=load_eia_series(); r=map_regimes(fit_regimes(a)); print(r['engine'], [round(m,1) for m in r['means']], r['regime_by_state'])"` prints `hmmlearn`, three ascending means, and `['GREEN','GREY','RED']`.

- [ ] 3. Create the artifact builder `build_artifact(out_path)` in `src/hmm/hmm_build.py`.
      Compose the loader + model + mapping into the JSON object (schema below), create `data/build/` with
      `os.makedirs(..., exist_ok=True)`, and write `data/build/hmm_regimes.json` with
      `json.dump(..., indent=2, sort_keys=True)` + trailing newline for a stable diff. Round floats to a fixed
      precision (6 dp) so the committed file is byte-stable across runs. Add a `if __name__ == "__main__":`
      guard that calls `build_artifact` and prints the output path. Run it to produce the committed artifact.
      Files: src/hmm/hmm_build.py, data/build/hmm_regimes.json
      Verify: `cd fairwatt-kit && python3 -m src.hmm.hmm_build && python3 -c "import json; d=json.load(open('data/build/hmm_regimes.json')); print(sorted(d.keys()))"` writes the file and prints all top-level keys.

  JSON schema for `data/build/hmm_regimes.json` (document this exactly in step 5):
  ```json
  {
    "schema_version": "1.0.0",
    "source": "EIA-861M MA residential, data/snapshot/eia_ma_monthly_2026-08.csv, column kwh_per_customer",
    "unit": "kWh per residential customer per month",
    "engine": "hmmlearn",
    "seed": 42,
    "n_states": 3,
    "converged": true,
    "log_likelihood": -812.34,
    "log_likelihood_trajectory": [-980.1, -870.2, "... one entry per EM iteration, non-decreasing"],
    "states": [
      {"index": 0, "regime": "GREEN", "mean": 523.4, "variance": 420.1, "stationary_prob": 0.33},
      {"index": 1, "regime": "GREY",  "mean": 632.7, "variance": 510.0, "stationary_prob": 0.41},
      {"index": 2, "regime": "RED",   "mean": 705.0, "variance": 600.2, "stationary_prob": 0.26}
    ],
    "regime_mapping": {"GREEN": 0, "GREY": 1, "RED": 2},
    "transition_matrix": [[0.8,0.15,0.05],[0.1,0.8,0.1],[0.05,0.2,0.75]],
    "stationary_distribution": [0.33, 0.41, 0.26],
    "timeline": [
      {"period": "2010-01", "value": 753.107, "state": 2, "regime": "RED"},
      {"period": "2010-02", "value": 709.718, "state": 2, "regime": "RED"}
    ]
  }
  ```
  `states`, `transition_matrix`, `stationary_distribution`, and `regime_mapping` are all in canonical
  mean-ascending order (state 0 = GREEN = lowest mean). `timeline` has one entry per input month in series
  order.

- [ ] 4. Create the pytest suite `tests/hmm/test_hmm_regimes.py` (and `tests/hmm/__init__.py`).
      Fit once in a module-scoped fixture off the real snapshot, build the artifact into a tmp path, and assert:
      (a) EM log-likelihood is non-decreasing across iterations (hmmlearn path) OR `converged` is true;
      (b) exactly 3 states are returned and the decoded path uses only indices 0–2;
      (c) the GREEN<GREY<RED ordering by mean holds (`means[0] < means[1] < means[2]`);
      (d) every transition-matrix row sums to 1.0 within `1e-6`;
      (e) the stationary distribution sums to 1.0 within `1e-6`;
      (f) `data/build/hmm_regimes.json` parses and contains every top-level field in the schema, `timeline`
      has one entry per input month (200), and each timeline regime matches its state via `regime_mapping`;
      (g) determinism: fitting twice with the same seed yields identical means (within `1e-9`).
      Files: tests/hmm/__init__.py, tests/hmm/test_hmm_regimes.py
      Verify: `cd fairwatt-kit && python3 -m pytest tests/hmm -q` — all assertions pass.

- [ ] 5. Write `research/backend-hmm.md` documenting the deliverable for the frontend teammate.
      Cover: which series and column were used and why; the hmmlearn-vs-numpy decision and how to tell which
      ran (`engine` field); the deterministic seed; the GREEN/GREY/RED meaning (green = good/low use, red =
      too-much use) and that states are sorted by mean; the **full `data/build/hmm_regimes.json` schema**
      (copy the schema block from step 3 with field-by-field descriptions and types); and the exact command to
      regenerate the artifact (`python3 -m src.hmm.hmm_build`). Note that RECS is excluded because it has no
      time axis.
      Files: research/backend-hmm.md
      Verify: `cd fairwatt-kit && python3 -c "import json,re; d=json.load(open('data/build/hmm_regimes.json')); doc=open('research/backend-hmm.md').read(); assert all(k in doc for k in d.keys()), 'doc missing a field'; print('doc covers all fields')"` prints the confirmation.

- [ ] 6. Final verification and staging.
      Re-run the full build then the full test suite from a clean state to confirm the committed artifact
      matches what the code produces, and run the data gate to confirm the snapshot we fit on is intact.
      Stage only the new HMM files by name (never `git add -A`/`.` — the guard-git hook blocks them) and leave
      committing to the workflow's finalize step; if committing here, use an `hmm:` subject prefix.
      Files: (none new)
      Verify: `cd fairwatt-kit && python3 -m src.hmm.hmm_build && python3 -m pytest tests/hmm -q && python3 reference/verify_usage.py data/snapshot/recs_ma_2020.csv data/snapshot/eia_ma_monthly_2026-08.csv` — build writes the artifact, all HMM tests pass, and G-DATA-3 prints PASS.

## Notes / assumptions

- `src/` currently holds no Python package markers; adding `src/hmm/__init__.py` and `tests/hmm/__init__.py`
  makes `src.hmm` and the tests importable with the `cd fairwatt-kit` working directory used in every verify
  step. If the implementer prefers a `conftest.py` to set `sys.path` instead of `__init__.py` files, either is
  acceptable as long as `python3 -m pytest tests/hmm` resolves the imports.
- Float rounding to 6 dp in the artifact is a deliberate choice for a byte-stable committed file; the test's
  determinism check (1e-9 on in-memory means) is stricter than the on-disk precision, which is fine.
- Do not touch sibling files (`stats_*`, `savings_*`, `map_*`, `forecast_mc_*`, `allcities_*`), `contracts/`,
  `.kiro/hooks/`, `scaffold/`, or `package.json`.
