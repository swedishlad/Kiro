"""Unit tests for Real Options Valuation (ROV) and capital asset timing."""

import pytest

from backend.climate.rov import (
    CleanAssetSpec,
    evaluate_asset_real_options,
    evaluate_portfolio_decisions,
)


@pytest.fixture
def base_solar_asset():
    return CleanAssetSpec(
        name="Test Solar Array (6 kW)",
        capex_usd=12_000.0,
        annual_output_kwh=7_200.0,
        annual_hardware_deflation_rate=0.035,
        federal_itc_pct=0.30,
        hardware_degradation_rate_yr=0.005,
        economic_life_years=20,
    )


def test_standard_solar_recommends_install_now(base_solar_asset):
    """Under standard parameters (3.5% deflation, high MOER), solar should recommend INSTALL NOW."""
    decision = evaluate_asset_real_options(
        asset=base_solar_asset,
        initial_moer_g_co2e_per_kwh=350.0,
        scc_usd_per_ton=190.0,
    )
    assert decision.recommendation == "INSTALL NOW"
    assert decision.delay_cost_metric_tons_per_yr > 0.0
    assert len(decision.deferral_analysis) == 4
    v0 = decision.deferral_analysis[0].net_option_value_usd
    for step in decision.deferral_analysis[1:]:
        assert v0 >= step.net_option_value_usd


def test_high_deflation_flips_to_hold_and_wait(base_solar_asset):
    """When hardware deflation is very rapid (e.g. 25%/year) and grid is clean/low SCC,

    the recommendation must flip to HOLD & WAIT.
    """
    rapid_deflation_asset = CleanAssetSpec(
        name="Rapid Deflation Tech",
        capex_usd=25_000.0,
        annual_output_kwh=5_000.0,
        annual_hardware_deflation_rate=0.25,
        federal_itc_pct=0.30,
        hardware_degradation_rate_yr=0.005,
        economic_life_years=20,
    )
    decision = evaluate_asset_real_options(
        asset=rapid_deflation_asset,
        initial_moer_g_co2e_per_kwh=100.0,
        scc_usd_per_ton=50.0,
        avoided_electricity_rate_usd=0.15,
    )
    assert decision.recommendation == "HOLD & WAIT"
    v0 = decision.deferral_analysis[0].net_option_value_usd
    v1 = decision.deferral_analysis[1].net_option_value_usd
    assert v1 > v0, "Waiting 1 year should have higher net option value due to 25% deflation"


def test_delay_cost_strictly_positive(base_solar_asset):
    """Irreversible carbon delay cost must be positive for all active generation assets."""
    decision = evaluate_asset_real_options(
        asset=base_solar_asset,
        initial_moer_g_co2e_per_kwh=300.0,
    )
    assert decision.delay_cost_metric_tons_per_yr > 0.0
    assert pytest.approx(decision.delay_cost_metric_tons_per_yr, rel=1e-2) == 2.16


def test_portfolio_evaluates_multiple_assets():
    """Portfolio evaluation handles both Solar and Battery assets."""
    decisions = evaluate_portfolio_decisions(initial_moer_g_co2e_per_kwh=320.0)
    assert len(decisions) >= 2
    names = [d.asset_name for d in decisions]
    assert any("Solar" in n for n in names)
    assert any("Storage" in n or "Battery" in n for n in names)
    for d in decisions:
        assert d.co2_averted_lifetime_tons_median > 0.0
        assert d.co2_averted_lifetime_tons_p05 <= d.co2_averted_lifetime_tons_median <= d.co2_averted_lifetime_tons_p95
