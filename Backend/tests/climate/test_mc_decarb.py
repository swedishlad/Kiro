"""Unit tests and benchmarks for C++ and Python Monte Carlo decarbonization engine."""

import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.climate.mc_decarb import (
    build_fan_chart_response,
    run_monte_carlo_decarbonization,
)


def test_seed_determinism():
    """Identical seeds must yield identical results across all quantile paths."""
    res1 = run_monte_carlo_decarbonization(
        initial_moer_g_co2e_per_kwh=350.0,
        annual_kwh=9000.0,
        num_paths=1000,
        num_years=10,
        base_seed=20261024,
    )
    res2 = run_monte_carlo_decarbonization(
        initial_moer_g_co2e_per_kwh=350.0,
        annual_kwh=9000.0,
        num_paths=1000,
        num_years=10,
        base_seed=20261024,
    )
    assert res1.yearly_median_tons == res2.yearly_median_tons
    assert res1.yearly_p05_tons == res2.yearly_p05_tons
    assert res1.yearly_p95_tons == res2.yearly_p95_tons
    assert pytest.approx(res1.terminal_mean_tons, rel=1e-7) == res2.terminal_mean_tons


def test_percentile_monotonicity_all_years():
    """For every year y, p05 <= median <= p95 must strictly hold."""
    res = run_monte_carlo_decarbonization(
        initial_moer_g_co2e_per_kwh=340.0,
        annual_kwh=8500.0,
        num_paths=2000,
        num_years=20,
        base_seed=42,
    )
    for y in range(20):
        p05 = res.yearly_p05_tons[y]
        p50 = res.yearly_median_tons[y]
        p95 = res.yearly_p95_tons[y]
        assert p05 <= p50, f"Year {y + 1}: p05 ({p05}) > median ({p50})"
        assert p50 <= p95, f"Year {y + 1}: median ({p50}) > p95 ({p95})"


def test_cumulative_monotonicity_across_years():
    """Cumulative carbon emissions must increase monotonically with years."""
    res = run_monte_carlo_decarbonization(
        initial_moer_g_co2e_per_kwh=320.0,
        annual_kwh=8000.0,
        num_paths=1000,
        num_years=15,
        base_seed=12345,
    )
    for y in range(1, 15):
        assert res.yearly_median_tons[y] >= res.yearly_median_tons[y - 1]
        assert res.yearly_p05_tons[y] >= res.yearly_p05_tons[y - 1]
        assert res.yearly_p95_tons[y] >= res.yearly_p95_tons[y - 1]


def test_solar_reduces_carbon():
    """Adding solar generation must strictly reduce median lifetime carbon emissions."""
    res_no_solar = run_monte_carlo_decarbonization(
        initial_moer_g_co2e_per_kwh=350.0,
        annual_kwh=9000.0,
        solar_kwh_yr=0.0,
        num_paths=1000,
        num_years=10,
        base_seed=777,
    )
    res_with_solar = run_monte_carlo_decarbonization(
        initial_moer_g_co2e_per_kwh=350.0,
        annual_kwh=9000.0,
        solar_kwh_yr=6000.0,
        num_paths=1000,
        num_years=10,
        base_seed=777,
    )
    for y in range(10):
        assert res_with_solar.yearly_median_tons[y] < res_no_solar.yearly_median_tons[y]


def test_invalid_inputs_raise():
    """Invalid parameter inputs raise ValueError from C++ / Python."""
    with pytest.raises(ValueError):
        run_monte_carlo_decarbonization(
            initial_moer_g_co2e_per_kwh=-10.0,
            annual_kwh=9000.0,
        )
    with pytest.raises(ValueError):
        run_monte_carlo_decarbonization(
            initial_moer_g_co2e_per_kwh=350.0,
            annual_kwh=9000.0,
            annual_decarb_rate=1.5,
        )


def test_performance_benchmark():
    """10,000 paths across 20 years (7,300 days) must complete within 800ms."""
    t0 = time.perf_counter()
    res = run_monte_carlo_decarbonization(
        initial_moer_g_co2e_per_kwh=350.0,
        annual_kwh=9000.0,
        solar_kwh_yr=4000.0,
        battery_kwh=10.0,
        num_paths=10_000,
        num_years=20,
        base_seed=20261024,
    )
    elapsed = time.perf_counter() - t0
    assert len(res.yearly_median_tons) == 20
    assert elapsed < 0.800, f"Monte Carlo simulation took too long: {elapsed:.3f}s"


def test_concurrent_thread_pool_execution():
    """Verify multiple concurrent simulations in Python ThreadPool run safely."""

    def _run_sim(seed):
        return run_monte_carlo_decarbonization(
            initial_moer_g_co2e_per_kwh=300.0,
            annual_kwh=8000.0,
            num_paths=1000,
            num_years=5,
            base_seed=seed,
        )

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(_run_sim, 1000 + i) for i in range(4)]
        results = [f.result() for f in futures]

    assert len(results) == 4
    for res in results:
        assert len(res.yearly_median_tons) == 5


def test_build_fan_chart_response():
    """Verify FanChartResponse correctly handles annual and cumulative modes."""
    res = run_monte_carlo_decarbonization(
        initial_moer_g_co2e_per_kwh=350.0,
        annual_kwh=9000.0,
        num_paths=500,
        num_years=5,
    )
    chart_annual = build_fan_chart_response(res, num_years=5, cumulative=False)
    assert chart_annual.years == [1, 2, 3, 4, 5]
    assert len(chart_annual.median_tons) == 5

    chart_cum = build_fan_chart_response(res, num_years=5, cumulative=True)
    assert chart_cum.years == [1, 2, 3, 4, 5]
    assert len(chart_cum.median_tons) == 5
    for y in range(1, 5):
        assert chart_cum.median_tons[y] >= chart_cum.median_tons[y - 1]


def test_python_fallback_simulation():
    """Directly test the pure Python fallback engine for coverage and parity."""
    from backend.climate.mc_decarb import _simulate_grid_decarb_python

    py_res = _simulate_grid_decarb_python(
        initial_moer_g_co2e_per_kwh=300.0,
        theta=0.5,
        sigma=50.0,
        annual_decarb_rate=0.03,
        solar_degradation_rate_yr=0.005,
        battery_fade_rate_yr=0.02,
        annual_kwh=8000.0,
        solar_kwh_yr=2000.0,
        battery_kwh=5.0,
        num_paths=20,
        num_years=3,
        base_seed=42,
    )
    assert len(py_res.yearly_median_tons) == 3
    assert py_res.yearly_p05_tons[0] <= py_res.yearly_median_tons[0] <= py_res.yearly_p95_tons[0]
    assert py_res.terminal_mean_tons > 0.0

    with pytest.raises(ValueError):
        _simulate_grid_decarb_python(300.0, 0.5, 50.0, 0.03, 0.005, 0.02, 8000.0, 0.0, 0.0, num_paths=0, num_years=3)
    with pytest.raises(ValueError):
        _simulate_grid_decarb_python(-10.0, 0.5, 50.0, 0.03, 0.005, 0.02, 8000.0, 0.0, 0.0, num_paths=10, num_years=3)
