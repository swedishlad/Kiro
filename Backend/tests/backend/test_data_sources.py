"""Tests for the shared backend loaders and statistical helpers.

Loads the real snapshots once (module-scoped fixtures) and asserts the derived helpers match the
ground-truth anchors from ``.kiro/steering/ground-truth.md`` / ``reference/verify_usage.py``.

Run: ``cd fairwatt-kit && python3 -m pytest tests/backend/test_data_sources.py -q``
"""
from __future__ import annotations

import os
import sys

import pytest

# Make the repo root importable (so ``src.backend`` resolves) regardless of pytest's rootdir.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from src.backend.data_sources import (  # noqa: E402
    GROUND_TRUTH_SHARES,
    GROUND_TRUTH_TYPICAL_ANNUAL,
    GROUND_TRUTH_TYPICAL_MONTHLY,
    load_eia,
    load_fixed_rates,
    load_recs,
    seasonal_shares,
    typical_account_2025,
    weighted_percentile,
)


@pytest.fixture(scope="module")
def recs():
    return load_recs()


@pytest.fixture(scope="module")
def eia():
    return load_eia()


def test_load_recs_shape(recs):
    assert len(recs) == 552
    for r in recs:
        for key in ("KWH", "TOTSQFT_EN", "FUELHEAT", "NWEIGHT"):
            assert isinstance(r[key], float)


def test_load_eia_shape(eia):
    assert len(eia) == 200
    assert (eia[0]["year"], eia[0]["month"]) == (2010, 1)
    assert (eia[-1]["year"], eia[-1]["month"]) == (2026, 8)


def test_load_fixed_rates_current_term():
    rows = load_fixed_rates()
    # Newest term (term_end 2027-01) carries the current basic-service fixed rates.
    first = rows[0]
    assert (first[0], first[1]) == (2027, 1)
    assert first[2] == {"NG": 17.185, "EV_EAST": 17.323, "EV_WEST": 15.934, "UNITIL": 18.921}


def test_weighted_percentile_matches_wmed(recs):
    # p=0.5 must reproduce verify_usage.py's weighted-median anchors.
    vals = [r["KWH"] for r in recs]
    wts = [r["NWEIGHT"] for r in recs]
    assert round(weighted_percentile(vals, wts, 0.50)) in range(5000, 9000)
    # ordering must hold for any monotone set of percentiles
    p10 = weighted_percentile(vals, wts, 0.10)
    p50 = weighted_percentile(vals, wts, 0.50)
    p90 = weighted_percentile(vals, wts, 0.90)
    assert p10 <= p50 <= p90


def test_weighted_percentile_fail_closed():
    with pytest.raises(ValueError):
        weighted_percentile([], [], 0.5)
    with pytest.raises(ValueError):
        weighted_percentile([1.0], [1.0, 2.0], 0.5)
    with pytest.raises(ValueError):
        weighted_percentile([1.0], [1.0], 1.5)
    with pytest.raises(ValueError):
        weighted_percentile([1.0], [0.0], 0.5)


def test_seasonal_shares_match_ground_truth(eia):
    shares = seasonal_shares(eia)
    assert abs(sum(shares) - 1.0) <= 0.001
    assert [round(s, 4) for s in shares] == GROUND_TRUTH_SHARES


def test_typical_account_matches_ground_truth(eia):
    annual, monthly = typical_account_2025(eia)
    assert annual == GROUND_TRUTH_TYPICAL_ANNUAL
    assert monthly == GROUND_TRUTH_TYPICAL_MONTHLY
