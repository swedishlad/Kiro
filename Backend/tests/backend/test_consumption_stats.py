"""Tests for Deliverable 1 (consumption statistics) and its committed JSON artifact.

Covers plan tests 1-3: band ordering (annual + 12 monthly), seasonal-share sum and anchor,
weighted sqft/fuel medians, unweighted median/mean cross-checks, the typical-account vector,
and that the written JSON round-trips with the required top-level keys.

Run: ``cd fairwatt-kit && python3 -m pytest tests/backend/test_consumption_stats.py -q``
"""
from __future__ import annotations

import json
import os
import sys

import pytest

# Make the repo root importable (so ``src.backend`` resolves) regardless of pytest's rootdir.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from src.backend.build_stats import build_artifact, build_payload  # noqa: E402
from src.backend.data_sources import (  # noqa: E402
    GROUND_TRUTH_SHARES,
    GROUND_TRUTH_TYPICAL_ANNUAL,
    GROUND_TRUTH_TYPICAL_MONTHLY,
)
from src.backend.stats_consumption import home_like_yours_stats, typical_account_stats  # noqa: E402


@pytest.fixture(scope="module")
def payload():
    return build_payload()


# --- Test 1: band ordering -------------------------------------------------

def test_annual_band_ordering(payload):
    a = payload["homeLikeYours"]["annualKwh"]
    assert a["p10"] <= a["p50"] <= a["p90"]


def test_monthly_band_ordering(payload):
    months = payload["homeLikeYours"]["monthlyKwh"]
    assert len(months) == 12
    for m in months:
        assert m["p10"] <= m["p50"] <= m["p90"]
    assert [m["month"] for m in months] == list(range(1, 13))


# --- Test 2: seasonal shares -----------------------------------------------

def test_seasonal_shares_sum_and_anchor(payload):
    shares = payload["seasonalShares"]
    assert abs(sum(shares) - 1.0) <= 0.001
    assert abs(payload["seasonalSharesSum"] - 1.0) <= 0.001
    assert [round(s, 4) for s in shares] == GROUND_TRUTH_SHARES


# --- Test 3: ground-truth anchors ------------------------------------------

def test_weighted_sqft_medians():
    home = home_like_yours_stats()
    medians = {b: round(home["bySqftBucket"][b]["p50"]) for b in home["bySqftBucket"]}
    assert medians == {"<1000": 4074, "1000-1999": 5974, "2000-2999": 7270, "3000+": 10597}


def test_weighted_fuel_medians():
    home = home_like_yours_stats()
    medians = {label: round(home["byHeatFuel"][label]["p50"]) for label in home["byHeatFuel"]}
    assert medians == {"gas": 5616, "oil": 8148, "electricity": 6092, "propane": 7255, "wood": 7270}


def test_unweighted_cross_checks():
    home = home_like_yours_stats()
    annual = home["annualKwh"]
    assert round(annual["unweightedMedian"]) == 6649
    assert round(annual["unweightedMean"]) == 7868


def test_typical_account_vector():
    typical = typical_account_stats()
    assert typical["annualKwh"] == GROUND_TRUTH_TYPICAL_ANNUAL
    assert typical["monthlyKwh"] == GROUND_TRUTH_TYPICAL_MONTHLY


# --- Artifact round-trip ---------------------------------------------------

def test_artifact_roundtrip_and_keys(tmp_path):
    out = tmp_path / "consumption_stats.json"
    build_artifact(str(out))
    loaded = json.loads(out.read_text())
    for key in ("generated", "sources", "homeLikeYours", "typicalAccount",
                "seasonalShares", "seasonalSharesSum"):
        assert key in loaded
    assert len(loaded["seasonalShares"]) == 12
    assert len(loaded["homeLikeYours"]["monthlyKwh"]) == 12
