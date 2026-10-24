"""Tests for Deliverable 2 (savings counterfactual) and its committed JSON artifact.

Covers plan tests 4-6: sign + magnitude (hand-worked -$187.79 and +$13.11), zero + linearity,
the basic-service rate lookup for Aug 2026-Jan 2027, and that the written JSON round-trips with
the required top-level keys.

Run: ``cd fairwatt-kit && python3 -m pytest tests/backend/test_savings.py -q``
"""
from __future__ import annotations

import json
import os
import re
import sys

import pytest

# Make the repo root importable (so ``src.backend`` resolves) regardless of pytest's rootdir.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from src.backend.build_savings import build_artifact, build_payload  # noqa: E402
from src.backend.savings_model import basic_service_cents, savings, term_spans  # noqa: E402

DISPLAY_RE = re.compile(r"^-?\$\d{1,3}(,\d{3})*\.\d{2}$")


# --- Test 4: sign + magnitude (hand-worked) --------------------------------

def test_overpaid_case_sign_and_magnitude():
    # NG, paid 22.0c vs basic 17.185c, 650 kWh, 6 months.
    # monthly saved = (17.185 - 22.0) * 650 / 100 = -31.2975; total = 6 * -31.2975 = -187.785.
    r = savings([650] * 6, 22.0, "NG", "2026-08", months=6)
    assert r["savedTotal"] == pytest.approx(-187.785, abs=1e-9)
    assert r["savedTotalDisplay"] == "-$187.79"
    for v in r["savedMonthly"]:
        assert v == pytest.approx(-31.2975, abs=1e-9)
    assert all(d == "-$31.30" for d in r["savedMonthlyDisplay"])
    assert DISPLAY_RE.match(r["savedTotalDisplay"])


def test_positive_savings_case():
    # userRate 15.0c vs NG 17.185c, 600 kWh, 1 month -> (17.185 - 15.0) * 600 / 100 = +13.11.
    r = savings([600], 15.0, "NG", "2026-08", months=1)
    assert r["savedTotal"] == pytest.approx(13.11, abs=1e-9)
    assert r["savedTotalDisplay"] == "$13.11"
    assert DISPLAY_RE.match(r["savedTotalDisplay"])


# --- Test 5: zero + linearity ----------------------------------------------

def test_zero_when_user_equals_basic():
    basic = basic_service_cents("NG", 2026, 8)
    r = savings([650] * 6, basic, "NG", "2026-08", months=6)
    assert r["savedTotal"] == pytest.approx(0.0, abs=1e-9)
    for v in r["savedMonthly"]:
        assert v == pytest.approx(0.0, abs=1e-9)


def test_linearity_in_kwh():
    k1, k2 = 400.0, 250.0
    r1 = savings([k1], 22.0, "NG", "2026-08", months=1)
    r2 = savings([k2], 22.0, "NG", "2026-08", months=1)
    r12 = savings([k1 + k2], 22.0, "NG", "2026-08", months=1)
    assert r12["savedTotal"] == pytest.approx(r1["savedTotal"] + r2["savedTotal"], abs=1e-9)


def test_total_equals_sum_of_monthly_exactly():
    r = savings([650, 700, 500, 480, 460, 620], 22.0, "NG", "2026-08", months=6)
    assert r["savedTotal"] == sum(r["savedMonthly"])


# --- Test 6: rate lookup ---------------------------------------------------

@pytest.mark.parametrize("utility,expected", [
    ("NG", 17.185),
    ("EV_EAST", 17.323),
    ("EV_WEST", 15.934),
    ("UNITIL", 18.921),
])
def test_basic_service_rate_lookup_aug2026_jan2027(utility, expected):
    spans = term_spans()
    # Every month Aug 2026 .. Jan 2027 resolves to the same current-term rate.
    for y, m in [(2026, 8), (2026, 9), (2026, 10), (2026, 11), (2026, 12), (2027, 1)]:
        assert basic_service_cents(utility, y, m, spans) == expected


# --- Artifact round-trip ---------------------------------------------------

def test_artifact_roundtrip_and_keys(tmp_path):
    out = tmp_path / "savings_model.json"
    build_artifact(str(out))
    loaded = json.loads(out.read_text())
    for key in ("generated", "method", "defaultPeriodMonths", "basicServiceRatesCents", "examples"):
        assert key in loaded
    assert loaded["defaultPeriodMonths"] == 6
    rates = loaded["basicServiceRatesCents"]
    assert rates["NG"] == 17.185
    assert rates["EV_EAST"] == 17.323
    assert rates["EV_WEST"] == 15.934
    assert rates["UNITIL"] == 18.921
    assert rates["term"] == "2026-08..2027-01"
    assert len(loaded["examples"]) >= 2


def test_build_payload_matches_hand_worked():
    payload = build_payload()
    ex0 = payload["examples"][0]
    assert ex0["savedTotal"] == pytest.approx(-187.785, abs=1e-9)
    assert ex0["savedTotalDisplay"] == "-$187.79"
