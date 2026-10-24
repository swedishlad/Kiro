"""Unit tests for carbon emissions accounting, SCC monetization, and portfolio yields."""

import pytest

from backend.climate.valuation import (
    calculate_annual_emissions_metric_tons,
    calculate_daily_emissions_metric_tons,
    calculate_lifetime_co2_liability,
    calculate_portfolio_carbon_yield_pct,
    calculate_social_carbon_damage,
)


def test_calculate_daily_emissions_exact_conversion():
    """Verify 1,000,000 grams equals exactly 1.0 metric ton."""
    hourly_kwh = [100.0] * 24
    hourly_moer = [1_000_000.0 / 2400.0] * 24
    tons = calculate_daily_emissions_metric_tons(hourly_kwh, hourly_moer)
    assert pytest.approx(tons, rel=1e-6) == 1.0


def test_calculate_daily_emissions_length_validation():
    """Verify ValueError is raised if arrays do not have length 24."""
    with pytest.raises(ValueError, match="must contain exactly 24 elements"):
        calculate_daily_emissions_metric_tons([1.0] * 23, [300.0] * 24)

    with pytest.raises(ValueError, match="must contain exactly 24 elements"):
        calculate_daily_emissions_metric_tons([1.0] * 24, [300.0] * 25)


def test_annualization_scaling():
    """Verify daily emissions are multiplied by 365."""
    daily_tons = 0.01
    annual_tons = calculate_annual_emissions_metric_tons(daily_tons)
    assert pytest.approx(annual_tons, rel=1e-6) == 3.65


def test_calculate_lifetime_co2_liability():
    """Verify 20-year undiscounted cumulative carbon liability."""
    annual_tons = 3.5
    liability_20 = calculate_lifetime_co2_liability(annual_tons, years=20)
    assert pytest.approx(liability_20, rel=1e-6) == 70.0

    with pytest.raises(ValueError):
        calculate_lifetime_co2_liability(-1.0, 20)
    with pytest.raises(ValueError):
        calculate_lifetime_co2_liability(3.5, 0)


def test_calculate_social_carbon_damage():
    """Verify annual emissions multiplied by federal SCC rate ($190/ton)."""
    annual_tons = 2.5
    damage = calculate_social_carbon_damage(annual_tons, scc_usd_per_ton=190.0)
    assert pytest.approx(damage, rel=1e-6) == 475.0

    with pytest.raises(ValueError):
        calculate_social_carbon_damage(-2.0, 190.0)


def test_calculate_portfolio_carbon_yield():
    """Verify portfolio carbon dividend yield calculation."""
    yield_pct = calculate_portfolio_carbon_yield_pct(annual_tons_abated=2.0, benchmark_capex_usd=20_000.0)
    assert yield_pct == 10.0

    assert calculate_portfolio_carbon_yield_pct(0.0, 20_000.0) == 0.0
    assert calculate_portfolio_carbon_yield_pct(2.0, 0.0) == 0.0
    assert calculate_portfolio_carbon_yield_pct(-1.0, 20_000.0) == 0.0
