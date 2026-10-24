"""Tests for Deliverable 3 (per-town map + traffic-light) and its committed JSON artifact.

Covers plan tests 7-8: traffic-light thresholds equal the weighted P33/P66 of the RECS MA
annual-kWh distribution; boundary classification at exactly P33 and P66; exactly 351 town records
each with a class in {GREEN,GREY,RED}; ``modeled`` is true; every ``annualKwhModel`` finite and
> 0; and the written JSON round-trips with the required top-level keys.

Run: ``cd fairwatt-kit && python3 -m pytest tests/backend/test_map.py -q``
"""
from __future__ import annotations

import json
import math
import os
import sys

import pytest

# Make the repo root importable (so ``src.backend`` resolves) regardless of pytest's rootdir.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from src.backend.build_map import build_artifact, build_payload  # noqa: E402
from src.backend.data_sources import load_recs, weighted_percentile  # noqa: E402
from src.backend.map_consumption import classify, tercile_cuts  # noqa: E402

REQUIRED_CLASSES = {"GREEN", "GREY", "RED"}


# --- Test 7: traffic-light thresholds + boundary classification ------------

def test_thresholds_equal_weighted_terciles():
    rows = load_recs()
    kwh = [r["KWH"] for r in rows]
    weights = [r["NWEIGHT"] for r in rows]
    expected_green = weighted_percentile(kwh, weights, 0.33)
    expected_grey = weighted_percentile(kwh, weights, 0.66)
    green_max, grey_max = tercile_cuts(rows)
    assert green_max == pytest.approx(expected_green, abs=1e-9)
    assert grey_max == pytest.approx(expected_grey, abs=1e-9)
    assert green_max < grey_max


def test_boundary_classification():
    green_max, grey_max = tercile_cuts()
    # Exactly P33 -> GREEN (inclusive upper bound); just above -> GREY.
    assert classify(green_max, green_max, grey_max) == "GREEN"
    assert classify(green_max - 1.0, green_max, grey_max) == "GREEN"
    assert classify(green_max + 1.0, green_max, grey_max) == "GREY"
    # Exactly P66 -> GREY; just above -> RED.
    assert classify(grey_max, green_max, grey_max) == "GREY"
    assert classify(grey_max + 1.0, green_max, grey_max) == "RED"


# --- Test 8: coverage + shape ----------------------------------------------

def test_coverage_and_shape():
    payload = build_payload()
    towns = payload["towns"]
    assert len(towns) == 351
    assert payload["modeled"] is True
    assert payload["basis"] == "statewide-model"
    for t in towns:
        assert t["class"] in REQUIRED_CLASSES
        assert math.isfinite(t["annualKwhModel"])
        assert t["annualKwhModel"] > 0


def test_town_ids_cover_1_to_351():
    payload = build_payload()
    ids = sorted(t["townId"] for t in payload["towns"])
    assert ids == list(range(1, 352))


def test_class_matches_thresholds():
    payload = build_payload()
    th = payload["thresholds"]
    for t in payload["towns"]:
        assert t["class"] == classify(t["annualKwhModel"], th["greenMax"], th["greyMax"])


# --- Artifact round-trip ---------------------------------------------------

def test_artifact_roundtrip_and_keys(tmp_path):
    out = tmp_path / "map_consumption.json"
    build_artifact(str(out))
    loaded = json.loads(out.read_text())
    for key in ("generated", "basis", "modeled", "note", "thresholds", "towns"):
        assert key in loaded
    assert loaded["modeled"] is True
    th = loaded["thresholds"]
    for key in ("unit", "greenMax", "greyMax", "rule"):
        assert key in th
    assert len(loaded["towns"]) == 351
    first = loaded["towns"][0]
    for key in ("townId", "name", "census", "annualKwhModel", "class"):
        assert key in first
