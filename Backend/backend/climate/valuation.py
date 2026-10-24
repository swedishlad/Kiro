"""Carbon valuation, social cost of carbon accounting, and liability metrics.

Computes physical metric tons of CO2e emitted, lifetime liability, social damages
under federal SCC guidance, and clean energy portfolio dividend yield.
"""

from typing import Sequence

from backend.climate.config import (
    DAYS_PER_YEAR,
    DEFAULT_ANALYSIS_YEARS,
    DEFAULT_SCC_USD_PER_TON,
    GRAMS_PER_METRIC_TON,
)


def calculate_daily_emissions_metric_tons(
    hourly_kwh: Sequence[float],
    hourly_moer_g_per_kwh: Sequence[float],
) -> float:
    """Calculate total carbon emissions for a 24-hour cycle in metric tons CO2e."""
    if len(hourly_kwh) != 24 or len(hourly_moer_g_per_kwh) != 24:
        raise ValueError("Both hourly_kwh and hourly_moer_g_per_kwh must contain exactly 24 elements")

    total_grams = sum(kwh * moer for kwh, moer in zip(hourly_kwh, hourly_moer_g_per_kwh))
    return max(0.0, total_grams / GRAMS_PER_METRIC_TON)


def calculate_annual_emissions_metric_tons(
    daily_emissions_metric_tons: float,
) -> float:
    """Scale representative daily emissions to an annualized baseline."""
    return max(0.0, daily_emissions_metric_tons * DAYS_PER_YEAR)


def calculate_lifetime_co2_liability(
    annual_metric_tons: float,
    years: int = DEFAULT_ANALYSIS_YEARS,
) -> float:
    """Calculate cumulative undiscounted lifetime carbon emissions over an asset lifetime."""
    if annual_metric_tons < 0.0:
        raise ValueError(f"annual_metric_tons must be >= 0, got {annual_metric_tons}")
    if years < 1:
        raise ValueError(f"years must be >= 1, got {years}")
    return annual_metric_tons * float(years)


def calculate_social_carbon_damage(
    annual_metric_tons: float,
    scc_usd_per_ton: float = DEFAULT_SCC_USD_PER_TON,
) -> float:
    """Monetize annual carbon footprint using the Social Cost of Carbon."""
    if annual_metric_tons < 0.0 or scc_usd_per_ton < 0.0:
        raise ValueError("Inputs to calculate_social_carbon_damage must be non-negative")
    return annual_metric_tons * scc_usd_per_ton


def calculate_portfolio_carbon_yield_pct(
    annual_tons_abated: float,
    benchmark_capex_usd: float = 20_000.0,
) -> float:
    """Compute portfolio carbon yield: annual tons avoided per $1,000 CapEx as percentage."""
    if benchmark_capex_usd <= 0.0 or annual_tons_abated <= 0.0:
        return 0.0
    yield_metric = (annual_tons_abated / (benchmark_capex_usd / 1000.0)) * 100.0
    return round(yield_metric, 2)
