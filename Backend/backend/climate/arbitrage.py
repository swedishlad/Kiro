"""Linear programming (LP) optimizer for 24-hour hourly load shifting and battery dispatch.

Optimizes household net electricity load against locational marginal emissions (MOER)
and time-of-use (TOU) rates using SciPy's HiGHS interior point / simplex solver.
"""

from dataclasses import dataclass
from typing import Sequence

import numpy as np
from scipy.optimize import linprog

from backend.climate.config import (
    BATTERY_ROUND_TRIP_EFFICIENCY,
    DEFAULT_SCC_USD_PER_TON,
    GRAMS_PER_METRIC_TON,
)

# Standard Massachusetts TOU tariff structure ($/kWh)
DEFAULT_TOU_RATES: tuple[float, ...] = (
    0.22,
    0.22,
    0.22,
    0.22,
    0.22,
    0.22,
    0.22,
    0.22,  # 00:00 - 07:00
    0.34,
    0.34,
    0.34,
    0.34,
    0.34,
    0.34,
    0.34,
    0.34,  # 08:00 - 15:00
    0.34,
    0.34,
    0.34,
    0.34,
    0.34,  # 16:00 - 20:00
    0.22,
    0.22,
    0.22,  # 21:00 - 23:00
)

BATTERY_DEGRADATION_COST_PER_KWH = 0.015


@dataclass(frozen=True)
class ArbitrageResult:
    """Outcome of 24-hour dispatch and shifting optimization."""

    baseline_load_kwh: list[float]
    optimized_load_kwh: list[float]
    hourly_moer_g_co2e_per_kwh: list[float]
    battery_charge_kwh: list[float]
    battery_discharge_kwh: list[float]
    battery_soc_kwh: list[float]
    shifted_load_kwh: list[float]
    baseline_daily_emissions_grams: float
    optimized_daily_emissions_grams: float
    daily_emissions_saved_grams: float
    annual_tons_abated: float
    daily_financial_savings_usd: float
    annual_financial_savings_usd: float


def optimize_arbitrage(
    baseline_load_kwh: Sequence[float],
    hourly_moer_g_co2e_per_kwh: Sequence[float],
    shiftable_load_kwh: float = 0.0,
    max_battery_capacity_kwh: float = 0.0,
    max_grid_draw_kw: float = 15.0,
    carbon_vs_cost_weight: float = 0.70,
    scc_usd_per_ton: float = DEFAULT_SCC_USD_PER_TON,
    tou_rates: Sequence[float] | None = None,
) -> ArbitrageResult:
    """Solve the 24-hour joint load shifting and battery dispatch linear program."""
    if len(baseline_load_kwh) != 24 or len(hourly_moer_g_co2e_per_kwh) != 24:
        raise ValueError("baseline_load_kwh and hourly_moer_g_co2e_per_kwh must have length 24")

    rates = np.array(tou_rates or DEFAULT_TOU_RATES, dtype=float)
    moer = np.array(hourly_moer_g_co2e_per_kwh, dtype=float)
    base_load = np.array(baseline_load_kwh, dtype=float)
    total_base_load = float(np.sum(base_load))

    if shiftable_load_kwh <= 1e-6 and max_battery_capacity_kwh <= 1e-6:
        base_emissions_g = float(np.sum(base_load * moer))
        return ArbitrageResult(
            baseline_load_kwh=list(base_load),
            optimized_load_kwh=list(base_load),
            hourly_moer_g_co2e_per_kwh=list(moer),
            battery_charge_kwh=[0.0] * 24,
            battery_discharge_kwh=[0.0] * 24,
            battery_soc_kwh=[0.0] * 24,
            shifted_load_kwh=[0.0] * 24,
            baseline_daily_emissions_grams=base_emissions_g,
            optimized_daily_emissions_grams=base_emissions_g,
            daily_emissions_saved_grams=0.0,
            annual_tons_abated=0.0,
            daily_financial_savings_usd=0.0,
            annual_financial_savings_usd=0.0,
        )

    clamped_shiftable = min(shiftable_load_kwh, total_base_load * 0.85)
    baseline_flexible_per_hour = clamped_shiftable / 24.0
    inflexible_load = np.maximum(0.0, base_load - baseline_flexible_per_hour)

    carbon_cost_per_kwh = (moer / GRAMS_PER_METRIC_TON) * scc_usd_per_ton
    w = max(0.0, min(1.0, carbon_vs_cost_weight))
    blended_rate = w * carbon_cost_per_kwh + (1.0 - w) * rates

    c = np.zeros(96, dtype=float)
    c[0:24] = blended_rate
    c[24:48] = blended_rate + BATTERY_DEGRADATION_COST_PER_KWH
    c[48:72] = -blended_rate + BATTERY_DEGRADATION_COST_PER_KWH
    c[72:96] = 0.0

    bounds = []
    for _ in range(24):
        bounds.append((0.0, clamped_shiftable if clamped_shiftable > 0 else 0.0))
    max_charge = min(max_grid_draw_kw, max_battery_capacity_kwh * 0.5) if max_battery_capacity_kwh > 0 else 0.0
    for _ in range(24):
        bounds.append((0.0, max_charge))
    for _ in range(24):
        bounds.append((0.0, max_charge))
    for _ in range(24):
        bounds.append((0.0, max_battery_capacity_kwh if max_battery_capacity_kwh > 0 else 0.0))

    eta = BATTERY_ROUND_TRIP_EFFICIENCY
    eq_rows = []
    b_eq = []

    row_sum = np.zeros(96, dtype=float)
    row_sum[0:24] = 1.0
    eq_rows.append(row_sum)
    b_eq.append(clamped_shiftable)

    if max_battery_capacity_kwh > 1e-6:
        r0 = np.zeros(96, dtype=float)
        r0[72] = 1.0
        r0[95] = -1.0
        r0[24] = -eta
        r0[48] = 1.0
        eq_rows.append(r0)
        b_eq.append(0.0)

        for t in range(1, 24):
            rt = np.zeros(96, dtype=float)
            rt[72 + t] = 1.0
            rt[72 + t - 1] = -1.0
            rt[24 + t] = -eta
            rt[48 + t] = 1.0
            eq_rows.append(rt)
            b_eq.append(0.0)

    A_eq = np.array(eq_rows, dtype=float)
    b_eq = np.array(b_eq, dtype=float)

    ub_rows = []
    b_ub = []

    for t in range(24):
        row_draw = np.zeros(96, dtype=float)
        row_draw[t] = 1.0
        row_draw[24 + t] = 1.0
        row_draw[48 + t] = -1.0
        ub_rows.append(row_draw)
        b_ub.append(max_grid_draw_kw - inflexible_load[t])

        row_noneg = np.zeros(96, dtype=float)
        row_noneg[t] = -1.0
        row_noneg[24 + t] = -1.0
        row_noneg[48 + t] = 1.0
        ub_rows.append(row_noneg)
        b_ub.append(inflexible_load[t])

        row_serv = np.zeros(96, dtype=float)
        row_serv[t] = -1.0
        row_serv[48 + t] = 1.0
        ub_rows.append(row_serv)
        b_ub.append(inflexible_load[t])

    A_ub = np.array(ub_rows, dtype=float)
    b_ub = np.array(b_ub, dtype=float)

    try:
        res = linprog(
            c,
            A_ub=A_ub,
            b_ub=b_ub,
            A_eq=A_eq,
            b_eq=b_eq,
            bounds=bounds,
            method="highs",
        )
        if res.success:
            x = res.x
            shifted = x[0:24]
            charge = x[24:48]
            discharge = x[48:72]
            soc = x[72:96]
            opt_load = inflexible_load + shifted + charge - discharge
            opt_load = np.maximum(0.0, np.round(opt_load, 6))
        else:
            opt_load = base_load
            shifted = np.full(24, clamped_shiftable / 24.0)
            charge = np.zeros(24)
            discharge = np.zeros(24)
            soc = np.zeros(24)
    except Exception:
        opt_load = base_load
        shifted = np.full(24, clamped_shiftable / 24.0)
        charge = np.zeros(24)
        discharge = np.zeros(24)
        soc = np.zeros(24)

    base_emissions_g = float(np.sum(base_load * moer))
    opt_emissions_g = float(np.sum(opt_load * moer))
    saved_emissions_g = max(0.0, base_emissions_g - opt_emissions_g)
    annual_tons_abated = (saved_emissions_g / GRAMS_PER_METRIC_TON) * 365.0

    base_cost_usd = float(np.sum(base_load * rates))
    opt_cost_usd = float(np.sum(opt_load * rates))
    daily_fin_savings = max(0.0, base_cost_usd - opt_cost_usd)
    annual_fin_savings = daily_fin_savings * 365.0

    return ArbitrageResult(
        baseline_load_kwh=[float(x) for x in base_load],
        optimized_load_kwh=[float(x) for x in opt_load],
        hourly_moer_g_co2e_per_kwh=[float(x) for x in moer],
        battery_charge_kwh=[float(x) for x in charge],
        battery_discharge_kwh=[float(x) for x in discharge],
        battery_soc_kwh=[float(x) for x in soc],
        shifted_load_kwh=[float(x) for x in shifted],
        baseline_daily_emissions_grams=base_emissions_g,
        optimized_daily_emissions_grams=opt_emissions_g,
        daily_emissions_saved_grams=saved_emissions_g,
        annual_tons_abated=round(annual_tons_abated, 4),
        daily_financial_savings_usd=round(daily_fin_savings, 4),
        annual_financial_savings_usd=round(annual_fin_savings, 2),
    )
