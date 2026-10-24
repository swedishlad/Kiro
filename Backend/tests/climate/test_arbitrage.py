"""Unit tests for LP arbitrage and load-shifting optimization engine."""

import pytest

from backend.climate.arbitrage import optimize_arbitrage


@pytest.fixture
def sample_baseline_load():
    """Typical 24-hour residential load (25 kWh total)."""
    return [
        0.6,
        0.5,
        0.5,
        0.5,
        0.6,
        0.8,
        1.2,
        1.5,
        1.4,
        1.1,
        1.0,
        0.9,
        0.9,
        0.9,
        1.0,
        1.2,
        1.5,
        1.9,
        2.2,
        2.0,
        1.7,
        1.3,
        0.9,
        0.7,
    ]


@pytest.fixture
def sample_moer_profile():
    """Typical ISO-NE 24-hour MOER with overnight trough and evening peaker spike."""
    return [
        250.0,
        240.0,
        230.0,
        230.0,
        240.0,
        260.0,
        320.0,
        390.0,
        420.0,
        380.0,
        340.0,
        310.0,
        290.0,
        280.0,
        300.0,
        350.0,
        420.0,
        500.0,
        560.0,
        540.0,
        480.0,
        410.0,
        340.0,
        290.0,
    ]


def test_zero_flexibility_identity(sample_baseline_load, sample_moer_profile):
    """When shiftable load and battery capacity are zero, optimized load must match baseline."""
    res = optimize_arbitrage(
        baseline_load_kwh=sample_baseline_load,
        hourly_moer_g_co2e_per_kwh=sample_moer_profile,
        shiftable_load_kwh=0.0,
        max_battery_capacity_kwh=0.0,
    )
    assert res.optimized_load_kwh == sample_baseline_load
    assert res.daily_emissions_saved_grams == 0.0
    assert res.annual_tons_abated == 0.0
    assert res.annual_financial_savings_usd == 0.0


def test_flat_moer_and_rates_zero_battery_cycling(sample_baseline_load):
    """When grid emissions and TOU prices are completely flat, battery must not cycle."""
    flat_moer = [300.0] * 24
    flat_rates = [0.25] * 24

    res = optimize_arbitrage(
        baseline_load_kwh=sample_baseline_load,
        hourly_moer_g_co2e_per_kwh=flat_moer,
        shiftable_load_kwh=0.0,
        max_battery_capacity_kwh=10.0,
        tou_rates=flat_rates,
    )
    assert sum(res.battery_charge_kwh) == pytest.approx(0.0, abs=1e-4)
    assert sum(res.battery_discharge_kwh) == pytest.approx(0.0, abs=1e-4)


def test_shiftable_load_energy_conservation(sample_baseline_load, sample_moer_profile):
    """Sum of shifted load must strictly conserve total shiftable energy."""
    shift_kwh = 5.0
    res = optimize_arbitrage(
        baseline_load_kwh=sample_baseline_load,
        hourly_moer_g_co2e_per_kwh=sample_moer_profile,
        shiftable_load_kwh=shift_kwh,
        max_battery_capacity_kwh=0.0,
    )
    assert sum(res.shifted_load_kwh) == pytest.approx(shift_kwh, abs=1e-3)


def test_grid_cap_enforced(sample_baseline_load, sample_moer_profile):
    """Household grid draw must strictly never exceed max_grid_draw_kw."""
    grid_cap = 2.5
    res = optimize_arbitrage(
        baseline_load_kwh=sample_baseline_load,
        hourly_moer_g_co2e_per_kwh=sample_moer_profile,
        shiftable_load_kwh=6.0,
        max_battery_capacity_kwh=10.0,
        max_grid_draw_kw=grid_cap,
    )
    for t, opt_kw in enumerate(res.optimized_load_kwh):
        assert opt_kw <= grid_cap + 1e-4, f"Hour {t} exceeded grid cap: {opt_kw} > {grid_cap}"


def test_no_negative_draw_without_export(sample_baseline_load, sample_moer_profile):
    """Optimized net load must be non-negative in all hours."""
    res = optimize_arbitrage(
        baseline_load_kwh=sample_baseline_load,
        hourly_moer_g_co2e_per_kwh=sample_moer_profile,
        shiftable_load_kwh=4.0,
        max_battery_capacity_kwh=10.0,
    )
    for opt_kw in res.optimized_load_kwh:
        assert opt_kw >= 0.0


def test_load_shifts_from_peak_to_trough(sample_baseline_load, sample_moer_profile):
    """Load shifting must decrease load during evening peak and increase during overnight trough."""
    res = optimize_arbitrage(
        baseline_load_kwh=sample_baseline_load,
        hourly_moer_g_co2e_per_kwh=sample_moer_profile,
        shiftable_load_kwh=6.0,
        max_battery_capacity_kwh=0.0,
        carbon_vs_cost_weight=1.0,
    )
    peak_baseline = sum(sample_baseline_load[18:21])
    peak_optimized = sum(res.optimized_load_kwh[18:21])
    assert peak_optimized < peak_baseline, "Optimized load should reduce peak consumption"
    assert res.optimized_daily_emissions_grams < res.baseline_daily_emissions_grams
    assert res.annual_tons_abated > 0.0


def test_weight_tradeoff_behavior(sample_baseline_load, sample_moer_profile):
    """Validates that different weightings generate feasible solutions."""
    res_carbon = optimize_arbitrage(
        baseline_load_kwh=sample_baseline_load,
        hourly_moer_g_co2e_per_kwh=sample_moer_profile,
        shiftable_load_kwh=4.0,
        max_battery_capacity_kwh=8.0,
        carbon_vs_cost_weight=1.0,
    )
    res_cost = optimize_arbitrage(
        baseline_load_kwh=sample_baseline_load,
        hourly_moer_g_co2e_per_kwh=sample_moer_profile,
        shiftable_load_kwh=4.0,
        max_battery_capacity_kwh=8.0,
        carbon_vs_cost_weight=0.0,
    )
    assert res_carbon.optimized_daily_emissions_grams <= res_carbon.baseline_daily_emissions_grams
    assert res_cost.daily_financial_savings_usd >= 0.0


def test_invalid_lengths_raise_value_error(sample_moer_profile):
    """Passing non-24 arrays raises ValueError."""
    with pytest.raises(ValueError):
        optimize_arbitrage([1.0] * 12, sample_moer_profile)
