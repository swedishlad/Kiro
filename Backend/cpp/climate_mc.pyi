"""Type stubs for fairwatt_mc_cpp pybind11 extension."""

class SimulationResult:
    yearly_median_tons: list[float]
    yearly_p05_tons: list[float]
    yearly_p95_tons: list[float]
    terminal_mean_tons: float
    terminal_std_tons: float

def simulate_grid_decarb(
    initial_moer_g_co2e_per_kwh: float,
    theta: float,
    sigma: float,
    annual_decarb_rate: float,
    solar_degradation_rate_yr: float,
    battery_fade_rate_yr: float,
    annual_kwh: float,
    solar_kwh_yr: float,
    battery_kwh: float,
    num_paths: int = 10000,
    num_years: int = 20,
    base_seed: int = 20261024,
) -> SimulationResult: ...
