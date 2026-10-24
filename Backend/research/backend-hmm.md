# Backend: 3-state HMM energy-use regime model

Backend-only deliverable for the FairWatt MA energy planner. This workflow fits a 3-state
Gaussian Hidden Markov Model over the monthly MA residential consumption series and writes a
single committed static JSON artifact the frontend reads. **There is no UI here** — the
frontend teammate consumes `data/build/hmm_regimes.json`.

## What it models

Each month of MA residential consumption is assumed to be emitted by one of three hidden
"energy-use regimes". The HMM learns the regime means, how consumption varies within each
regime, and how months transition between regimes, then decodes which regime each historical
month was most likely in (the Viterbi path).

The three regimes are a traffic light keyed on **consumption level**:

| Regime | Meaning | State index |
|---|---|---|
| **GREEN** | good / low consumption | 0 (lowest mean) |
| **GREY** | mid consumption | 1 (middle mean) |
| **RED** | too-much / high consumption | 2 (highest mean) |

States are always sorted by **ascending mean** before they are written out, so `state 0`
is always GREEN and `state 2` is always RED regardless of how the fitting engine happened to
number its internal states. This matches the project direction (green = good/low, red =
too-much). MA consumption peaks in both summer and winter (ground-truth.md), so the model
keys on *level*, never on a hard-coded "winter" assumption.

## Series used (and what was excluded)

- **Series:** `data/snapshot/eia_ma_monthly_2026-08.csv`, column **`kwh_per_customer`** —
  200 monthly observations, 2010-01 … 2026-08, ascending with no gaps (verified by
  `reference/verify_usage.py`, gate G-DATA-3). This is the only clean continuous consumption
  time series in the repo, which is what an HMM needs.
- **RECS 2020 (`recs_ma_2020.csv`) is excluded:** it is a cross-section of 552 homes with no
  time axis, so it cannot form an ordered sequence for an HMM.

## Engine and fallback

- **Primary:** `hmmlearn.hmm.GaussianHMM` (`covariance_type="diag"`), used when `hmmlearn`
  imports successfully. `hmmlearn 0.3.3` is installed in this environment.
- **Fallback:** if `hmmlearn` is not importable, a self-contained pure-numpy Gaussian
  Baum-Welch (forward-backward in log space) + Viterbi runs instead. Both paths were
  exercised and produce three distinct ascending-mean states with transition rows summing to
  1.
- **How to tell which ran:** the `"engine"` field in the artifact is either `"hmmlearn"` or
  `"numpy-fallback"`.

## Determinism

A single module constant `SEED = 42` seeds both paths (hmmlearn's `random_state`, the numpy
fallback's `np.random.default_rng`). The series is z-scored only for fitting stability; all
means and variances are reported back in the original **kWh-per-customer** scale. Floats in
the committed artifact are rounded to 6 decimal places for a byte-stable diff. Running the
build twice yields an identical file.

## Regenerate the artifact

```
cd fairwatt-kit
python3 -m src.hmm.hmm_build      # writes data/build/hmm_regimes.json
python3 -m pytest tests/hmm -q    # 8 tests
```

## JSON schema — `data/build/hmm_regimes.json`

Top-level object. All of `states`, `transition_matrix`, `stationary_distribution` and
`regime_mapping` are in canonical mean-ascending order (index 0 = GREEN = lowest mean).

| Field | Type | Description |
|---|---|---|
| `schema_version` | string | Artifact schema version, currently `"1.0.0"`. |
| `source` | string | Human-readable description of the input series and column. |
| `unit` | string | Unit of `mean`, `variance` inputs and timeline `value`: kWh per residential customer per month. |
| `engine` | string | `"hmmlearn"` or `"numpy-fallback"` — which fitter produced this artifact. |
| `seed` | number | Deterministic RNG seed (42). |
| `n_states` | number | Number of hidden states (always 3). |
| `converged` | boolean | Whether the EM fit converged within tolerance. |
| `log_likelihood` | number | Final model log-likelihood on the standardized series. |
| `log_likelihood_trajectory` | number[] | One log-likelihood per EM iteration, non-decreasing. |
| `states` | object[] | The three states (see below), ordered by ascending mean. |
| `regime_mapping` | object | `{"GREEN": 0, "GREY": 1, "RED": 2}` — regime name → state index. |
| `transition_matrix` | number[3][3] | `transition_matrix[i][j]` = P(move to state `j` next month \| in state `i`). Each row sums to 1. |
| `stationary_distribution` | number[3] | Long-run probability of being in each state; sums to 1. Aligned to state index. |
| `timeline` | object[] | One entry per input month, in chronological order (200 entries). |

### `states[]` entry

| Field | Type | Description |
|---|---|---|
| `index` | number | State index, 0–2 (0 = GREEN lowest mean, 2 = RED highest mean). |
| `regime` | string | `"GREEN"`, `"GREY"` or `"RED"`. |
| `mean` | number | Mean monthly kWh per customer for this regime (original scale). |
| `variance` | number | Variance of monthly kWh per customer within this regime (original scale, kWh²). |
| `stationary_prob` | number | This state's entry in the stationary distribution. |

### `timeline[]` entry

| Field | Type | Description |
|---|---|---|
| `period` | string | Month as `"YYYY-MM"`. |
| `value` | number | Observed kWh per customer that month. |
| `state` | number | Most-likely state for that month (Viterbi), 0–2. |
| `regime` | string | Regime label for `state`, consistent with `regime_mapping`. |

### Example (abridged, real values from the committed artifact)

```json
{
  "schema_version": "1.0.0",
  "source": "EIA-861M MA residential, data/snapshot/eia_ma_monthly_2026-08.csv, column kwh_per_customer",
  "unit": "kWh per residential customer per month",
  "engine": "hmmlearn",
  "seed": 42,
  "n_states": 3,
  "converged": true,
  "log_likelihood": -222.519291,
  "log_likelihood_trajectory": [-313.436516, "... one entry per EM iteration, non-decreasing"],
  "states": [
    {"index": 0, "regime": "GREEN", "mean": 523.449167, "variance": 1329.863009, "stationary_prob": 0.493894},
    {"index": 1, "regime": "GREY",  "mean": 632.709251, "variance": 1352.466733, "stationary_prob": 0.165415},
    {"index": 2, "regime": "RED",   "mean": 704.965952, "variance": 4255.172232, "stationary_prob": 0.340691}
  ],
  "regime_mapping": {"GREEN": 0, "GREY": 1, "RED": 2},
  "transition_matrix": [[...], [...], [...]],
  "stationary_distribution": [0.493894, 0.165415, 0.340691],
  "timeline": [
    {"period": "2010-01", "value": 753.107, "state": 2, "regime": "RED"}
  ]
}
```

## Code layout

- `src/hmm/hmm_series.py` — `load_eia_series(path)`: pure loader of the EIA series.
- `src/hmm/hmm_model.py` — `fit_regimes(values, n_states=3)` and `map_regimes(result)`: fit
  (hmmlearn + numpy fallback), Viterbi decode, stationary distribution, and the canonical
  GREEN/GREY/RED remapping. Pure and importable.
- `src/hmm/hmm_build.py` — `build_payload()` / `build_artifact(out_path)`: compose and write
  the JSON artifact.
- `tests/hmm/test_hmm_regimes.py` — pytest suite (8 tests).
