"""Residential hourly electricity load synthesis and normalization.

Derives a realistic 24-hour load curve (kWh per hour) for residential households
based on monthly utility billing totals, calibrated against EPRI / ASHRAE
residential load research for ISO-NE climate zone 5A.
"""

from typing import Sequence

# Normalized 24-hour residential load shape (sum == 1.0)
DEFAULT_RESIDENTIAL_LOAD_WEIGHTS: tuple[float, ...] = (
    0.027,
    0.024,
    0.022,
    0.021,
    0.021,
    0.023,  # 00:00 - 05:00: Overnight base
    0.032,
    0.045,
    0.048,
    0.044,
    0.041,
    0.040,  # 06:00 - 11:00: Morning peak
    0.039,
    0.039,
    0.040,
    0.042,
    0.048,
    0.058,  # 12:00 - 17:00: Afternoon rise
    0.065,
    0.063,
    0.058,
    0.050,
    0.042,
    0.033,  # 18:00 - 23:00: Evening cooking/living peak
)


def synthesize_load_profile(
    total_monthly_kwh: float,
    billing_days: int = 30,
    weights: Sequence[float] | None = None,
) -> list[float]:
    """Synthesize a 24-hour residential hourly usage curve in kWh.

    Args:
        total_monthly_kwh: Monthly consumption in kWh.
        billing_days: Number of days in the billing cycle.
        weights: Optional custom 24-element hourly shape weights.

    Returns:
        List of 24 hourly kWh consumption values summing to daily consumption.
    """
    if total_monthly_kwh <= 0.0:
        raise ValueError(f"total_monthly_kwh must be positive, got {total_monthly_kwh}")
    if billing_days < 1:
        raise ValueError(f"billing_days must be >= 1, got {billing_days}")

    shape = weights or DEFAULT_RESIDENTIAL_LOAD_WEIGHTS
    if len(shape) != 24:
        raise ValueError(f"Hourly load weights must have length 24, got {len(shape)}")

    shape_sum = sum(shape)
    if shape_sum <= 0.0:
        raise ValueError("Sum of hourly weights must be strictly positive")

    daily_kwh = total_monthly_kwh / float(billing_days)
    return [float(daily_kwh * (w / shape_sum)) for w in shape]


def validate_or_synthesize_hourly(
    hourly_usage_kwh: Sequence[float] | None,
    total_monthly_kwh: float,
    billing_days: int = 30,
) -> list[float]:
    """Validate user-provided 24-hour profile or synthesize one from monthly total."""
    if hourly_usage_kwh is not None:
        if len(hourly_usage_kwh) != 24:
            raise ValueError(f"hourly_usage_kwh must contain exactly 24 values, got {len(hourly_usage_kwh)}")
        if any(h < 0.0 for h in hourly_usage_kwh):
            raise ValueError("hourly_usage_kwh cannot contain negative values")
        if sum(hourly_usage_kwh) <= 0.0:
            raise ValueError("Total daily consumption in hourly_usage_kwh must be positive")
        return [float(h) for h in hourly_usage_kwh]

    return synthesize_load_profile(total_monthly_kwh, billing_days)
