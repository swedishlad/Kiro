"""Tests for the 3-state Gaussian HMM regime model and its committed JSON artifact.

Fits once off the real EIA snapshot in a module-scoped fixture and builds the artifact into
a tmp path, then asserts the properties the frontend depends on. The deterministic SEED keeps
every assertion stable run to run.

Run: ``cd fairwatt-kit && python3 -m pytest tests/hmm -q``
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import pytest

# Make the repo root importable (so ``src.hmm`` resolves) regardless of pytest's rootdir.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from src.hmm.hmm_build import build_artifact, build_payload  # noqa: E402
from src.hmm.hmm_model import fit_regimes, map_regimes  # noqa: E402
from src.hmm.hmm_series import load_eia_series  # noqa: E402

EXPECTED_MONTHS = 200


@pytest.fixture(scope="module")
def series():
    return load_eia_series()


@pytest.fixture(scope="module")
def mapped(series):
    _, values = series
    return map_regimes(fit_regimes(values))


def test_log_likelihood_non_decreasing_or_converged(mapped):
    traj = mapped["log_likelihood_trajectory"]
    assert len(traj) >= 1
    # EM must not lose likelihood between iterations (allow tiny numerical slack) ...
    diffs = np.diff(np.asarray(traj, dtype=float))
    assert np.all(diffs >= -1e-6)
    # ... and the fit must have converged.
    assert mapped["converged"] is True


def test_exactly_three_states_and_valid_path(mapped):
    assert mapped["n_states"] == 3
    assert len(mapped["means"]) == 3
    path = np.asarray(mapped["path"], dtype=int)
    assert set(np.unique(path)).issubset({0, 1, 2})


def test_green_grey_red_ordering_by_mean(mapped):
    means = np.asarray(mapped["means"], dtype=float)
    assert means[0] < means[1] < means[2]
    assert mapped["regime_by_state"] == ["GREEN", "GREY", "RED"]
    assert mapped["regime_mapping"] == {"GREEN": 0, "GREY": 1, "RED": 2}


def test_transition_rows_sum_to_one(mapped):
    transmat = np.asarray(mapped["transition_matrix"], dtype=float)
    assert transmat.shape == (3, 3)
    row_sums = transmat.sum(axis=1)
    assert np.allclose(row_sums, 1.0, atol=1e-6)


def test_stationary_distribution_sums_to_one(mapped):
    stationary = np.asarray(mapped["stationary_distribution"], dtype=float)
    assert stationary.shape == (3,)
    assert np.isclose(stationary.sum(), 1.0, atol=1e-6)


def test_artifact_parses_with_all_fields(tmp_path):
    out = os.path.join(str(tmp_path), "hmm_regimes.json")
    build_artifact(out_path=out)
    with open(out) as fh:
        doc = json.load(fh)

    required = {
        "schema_version",
        "source",
        "unit",
        "engine",
        "seed",
        "n_states",
        "converged",
        "log_likelihood",
        "log_likelihood_trajectory",
        "states",
        "regime_mapping",
        "transition_matrix",
        "stationary_distribution",
        "timeline",
    }
    assert required.issubset(doc.keys())

    # One timeline entry per input month, each regime consistent with its state.
    assert len(doc["timeline"]) == EXPECTED_MONTHS
    inverse = {v: k for k, v in doc["regime_mapping"].items()}
    for entry in doc["timeline"]:
        assert inverse[entry["state"]] == entry["regime"]

    # States carry the canonical mapping and ascending means.
    assert [s["regime"] for s in doc["states"]] == ["GREEN", "GREY", "RED"]
    means = [s["mean"] for s in doc["states"]]
    assert means[0] < means[1] < means[2]


def test_committed_artifact_matches_code(tmp_path):
    """The committed data/build/hmm_regimes.json equals what build_payload produces."""
    committed_path = os.path.join(_REPO_ROOT, "data", "build", "hmm_regimes.json")
    assert os.path.exists(committed_path), "committed artifact is missing"
    with open(committed_path) as fh:
        committed = json.load(fh)
    payload = build_payload()
    if committed.get("engine") != payload.get("engine"):
        # The artifact records which engine built it (hmmlearn or the numpy fallback). On a machine where that
        # engine is unavailable the fallback legitimately gives different numbers, so exact equality can't hold.
        pytest.skip(f"artifact built with {committed.get('engine')!r}, this environment runs {payload.get('engine')!r}")
    assert committed == payload


def test_determinism_same_seed_same_means(series):
    _, values = series
    first = map_regimes(fit_regimes(values))
    second = map_regimes(fit_regimes(values))
    assert np.allclose(
        np.asarray(first["means"]), np.asarray(second["means"]), atol=1e-9
    )
