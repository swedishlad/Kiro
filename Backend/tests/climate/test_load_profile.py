"""Unit tests for load profile synthesis and shape validation."""

import pytest

from backend.climate.load_profile import (
    synthesize_load_profile,
    validate_or_synthesize_hourly,
)


def test_synthesize_load_profile_exact_daily_sum():
    """Synthesized hourly profile must sum exactly to daily kWh."""
    monthly_kwh = 900.0
    days = 30
    expected_daily = 30.0
    profile = synthesize_load_profile(monthly_kwh, days)
    assert len(profile) == 24
    assert pytest.approx(sum(profile), rel=1e-6) == expected_daily


def test_synthesize_load_profile_validation_errors():
    """Verify input domain checks for synthesis."""
    with pytest.raises(ValueError, match="total_monthly_kwh must be positive"):
        synthesize_load_profile(0.0)

    with pytest.raises(ValueError, match="billing_days must be >= 1"):
        synthesize_load_profile(500.0, billing_days=0)

    with pytest.raises(ValueError, match="must have length 24"):
        synthesize_load_profile(500.0, weights=[0.1] * 10)

    with pytest.raises(ValueError, match="strictly positive"):
        synthesize_load_profile(500.0, weights=[0.0] * 24)


def test_validate_or_synthesize_hourly_custom_valid():
    """User profile passes through unchanged when valid."""
    user_curve = [1.5] * 24
    res = validate_or_synthesize_hourly(user_curve, total_monthly_kwh=1000.0)
    assert res == user_curve


def test_validate_or_synthesize_hourly_custom_invalid():
    """User profile invalid lengths, negatives, or zero sum are rejected."""
    with pytest.raises(ValueError, match="exactly 24 values"):
        validate_or_synthesize_hourly([1.0] * 20, 500.0)

    with pytest.raises(ValueError, match="cannot contain negative"):
        validate_or_synthesize_hourly([-1.0] + [1.0] * 23, 500.0)

    with pytest.raises(ValueError, match="must be positive"):
        validate_or_synthesize_hourly([0.0] * 24, 500.0)


def test_validate_or_synthesize_hourly_none_falls_back():
    """When hourly is None, synthesizes based on total_monthly_kwh."""
    res = validate_or_synthesize_hourly(None, total_monthly_kwh=600.0, billing_days=30)
    assert len(res) == 24
    assert pytest.approx(sum(res), rel=1e-5) == 20.0
