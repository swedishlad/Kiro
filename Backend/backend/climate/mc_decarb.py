"""Monte Carlo grid decarbonization simulation wrapper.

Integrates the C++20 pybind11 engine (fairwatt_mc_cpp) with multi-threaded
GIL-released execution, deterministic PRNG seeding, and pure Python fallback.
"""

import logging
import math
import sys
from pathlib import Path

import numpy as np

from backend.climate.config import (
    BATTERY_FADE_RATE_YR,
    DAYS_PER_YEAR,
    DEFAULT_ANALYSIS_YEARS,
    DEFAULT_ANNUAL_DECARB_RATE,
    DEFAULT_MC_PATHS,
    DEFAULT_MC_SEED,
    DEFAULT_OU_SIGMA,
    DEFAULT_OU_THETA,
    GRAMS_PER_METRIC_TON,
    SOLAR_DEGRADATION_RATE_YR,
)
from backend.climate.schemas import FanChartResponse

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_BUILD_DIR = _REPO_ROOT / "build"
for _p in [str(_REPO_ROOT), str(_BUILD_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    import fairwatt_mc_cpp

    HAS_CPP_MC = True
except ImportError:
    logger.warning("fairwatt_mc_cpp C++ extension not found; falling back to pure Python MC.")
    HAS_CPP_MC = False
    fairwatt_mc_cpp = None  # type: ignore

# Paths the NumPy fallback advances at once (its normals take n x days x 8 bytes: ~58 MB at 20 years).
_PY_CHUNK_PATHS = 1000


def _simulate_grid_decarb_python(
    initial_moer_g_co2e_per_kwh: float,
    theta: float,
    sigma: float,
    annual_decarb_rate: float,
    solar_degradation_rate_yr: float,
    battery_fade_rate_yr: float,
    annual_kwh: float,
    solar_kwh_yr: float,
    battery_kwh: float,
    num_paths: int = DEFAULT_MC_PATHS,
    num_years: int = DEFAULT_ANALYSIS_YEARS,
    base_seed: int = DEFAULT_MC_SEED,
):
    """Pure Python (NumPy) fallback for simulate_grid_decarb.

    Advances a chunk of paths together. Each path still draws its normals in path-major order and
    does the same float operations as a path-by-path loop, so the result is bit-identical to that
    loop whatever the chunk size (tests/climate/test_mc_decarb.py pins this).
    """
    if num_paths <= 0 or num_years <= 0:
        raise ValueError("num_paths and num_years must be positive")
    if initial_moer_g_co2e_per_kwh < 0 or annual_kwh < 0:
        raise ValueError("moer and annual_kwh must be non-negative")
    # Same input contract as the C++ engine's validate_inputs.
    if theta < 0 or sigma < 0 or solar_kwh_yr < 0 or battery_kwh < 0:
        raise ValueError("theta, sigma, solar_kwh_yr and battery_kwh must be non-negative")
    for name, rate in (
        ("annual_decarb_rate", annual_decarb_rate),
        ("solar_degradation_rate_yr", solar_degradation_rate_yr),
        ("battery_fade_rate_yr", battery_fade_rate_yr),
    ):
        if not 0.0 <= rate <= 1.0:
            raise ValueError(f"{name} must be in [0, 1], got {rate}")
    if num_years > 50:
        raise ValueError("num_years must be in [1, 50]")

    rng = np.random.default_rng(base_seed)
    dt = 1.0 / DAYS_PER_YEAR
    sqrt_dt = math.sqrt(dt)
    daily_base_kwh = annual_kwh / DAYS_PER_YEAR
    noise_scale = sigma * sqrt_dt
    num_days = num_years * DAYS_PER_YEAR

    # Long-run mean for every simulated day, with math.exp as in the scalar recurrence.
    mu = [
        initial_moer_g_co2e_per_kwh * math.exp(-annual_decarb_rate * (y + d / DAYS_PER_YEAR))
        for y in range(num_years)
        for d in range(DAYS_PER_YEAR)
    ]
    # Net daily load and the share the battery leaves on the grid, per year.
    yearly_load = []
    for y in range(num_years):
        solar_factor = (1.0 - solar_degradation_rate_yr) ** y
        battery_factor = (1.0 - battery_fade_rate_yr) ** y
        daily_solar = (solar_kwh_yr / DAYS_PER_YEAR) * solar_factor
        bat_fraction = min(0.20 * battery_factor, 1.0) if battery_kwh > 0 else 0.0
        yearly_load.append((max(0.0, daily_base_kwh - daily_solar), 1.0 - bat_fraction))

    all_cumulative = np.zeros((num_years, num_paths), dtype=float)

    for start in range(0, num_paths, _PY_CHUNK_PATHS):
        n = min(_PY_CHUNK_PATHS, num_paths - start)
        z = np.ascontiguousarray(rng.standard_normal((n, num_days)).T)
        c_t = np.full(n, float(initial_moer_g_co2e_per_kwh))
        cum_g = np.zeros(n)
        for y, (net_kwh, grid_share) in enumerate(yearly_load):
            for i in range(y * DAYS_PER_YEAR, (y + 1) * DAYS_PER_YEAR):
                c_t = np.maximum(0.0, c_t + theta * (mu[i] - c_t) * dt + noise_scale * z[i])
                cum_g += net_kwh * c_t * grid_share
            all_cumulative[y, start : start + n] = cum_g / GRAMS_PER_METRIC_TON

    yearly_median = []
    yearly_p05 = []
    yearly_p95 = []
    for y in range(num_years):
        row = np.sort(all_cumulative[y])
        yearly_p05.append(float(np.percentile(row, 5)))
        yearly_median.append(float(np.percentile(row, 50)))
        yearly_p95.append(float(np.percentile(row, 95)))

    class PyResult:
        pass

    res = PyResult()
    res.yearly_median_tons = yearly_median
    res.yearly_p05_tons = yearly_p05
    res.yearly_p95_tons = yearly_p95
    res.terminal_mean_tons = float(np.mean(all_cumulative[-1]))
    res.terminal_std_tons = float(np.std(all_cumulative[-1]))
    return res


def run_monte_carlo_decarbonization(
    initial_moer_g_co2e_per_kwh: float,
    annual_kwh: float,
    solar_kwh_yr: float = 0.0,
    battery_kwh: float = 0.0,
    theta: float = DEFAULT_OU_THETA,
    sigma: float = DEFAULT_OU_SIGMA,
    annual_decarb_rate: float = DEFAULT_ANNUAL_DECARB_RATE,
    solar_degradation_rate_yr: float = SOLAR_DEGRADATION_RATE_YR,
    battery_fade_rate_yr: float = BATTERY_FADE_RATE_YR,
    num_paths: int = DEFAULT_MC_PATHS,
    num_years: int = DEFAULT_ANALYSIS_YEARS,
    base_seed: int = DEFAULT_MC_SEED,
):
    """Run Monte Carlo simulation using the C++ engine or Python fallback."""
    if HAS_CPP_MC and fairwatt_mc_cpp is not None:
        return fairwatt_mc_cpp.simulate_grid_decarb(
            initial_moer_g_co2e_per_kwh=float(initial_moer_g_co2e_per_kwh),
            theta=float(theta),
            sigma=float(sigma),
            annual_decarb_rate=float(annual_decarb_rate),
            solar_degradation_rate_yr=float(solar_degradation_rate_yr),
            battery_fade_rate_yr=float(battery_fade_rate_yr),
            annual_kwh=float(annual_kwh),
            solar_kwh_yr=float(solar_kwh_yr),
            battery_kwh=float(battery_kwh),
            num_paths=int(num_paths),
            num_years=int(num_years),
            base_seed=int(base_seed),
        )
    return _simulate_grid_decarb_python(
        initial_moer_g_co2e_per_kwh=initial_moer_g_co2e_per_kwh,
        theta=theta,
        sigma=sigma,
        annual_decarb_rate=annual_decarb_rate,
        solar_degradation_rate_yr=solar_degradation_rate_yr,
        battery_fade_rate_yr=battery_fade_rate_yr,
        annual_kwh=annual_kwh,
        solar_kwh_yr=solar_kwh_yr,
        battery_kwh=battery_kwh,
        num_paths=num_paths,
        num_years=num_years,
        base_seed=base_seed,
    )


def build_fan_chart_response(
    mc_result,
    num_years: int = DEFAULT_ANALYSIS_YEARS,
    cumulative: bool = False,
) -> FanChartResponse:
    """Convert Monte Carlo simulation results to FanChartResponse schema."""
    years = list(range(1, num_years + 1))
    med_cum = mc_result.yearly_median_tons[:num_years]
    p05_cum = mc_result.yearly_p05_tons[:num_years]
    p95_cum = mc_result.yearly_p95_tons[:num_years]

    if cumulative:
        return FanChartResponse(
            years=years,
            median_tons=[round(x, 2) for x in med_cum],
            p05_lower_bound_tons=[round(x, 2) for x in p05_cum],
            p95_upper_bound_tons=[round(x, 2) for x in p95_cum],
        )

    median_annual = [med_cum[0]]
    p05_annual = [p05_cum[0]]
    p95_annual = [p95_cum[0]]

    for i in range(1, num_years):
        median_annual.append(max(0.0, med_cum[i] - med_cum[i - 1]))
        p05_annual.append(max(0.0, p05_cum[i] - p05_cum[i - 1]))
        p95_annual.append(max(0.0, p95_cum[i] - p95_cum[i - 1]))

    return FanChartResponse(
        years=years,
        median_tons=[round(x, 2) for x in median_annual],
        p05_lower_bound_tons=[round(x, 2) for x in p05_annual],
        p95_upper_bound_tons=[round(x, 2) for x in p95_annual],
    )
