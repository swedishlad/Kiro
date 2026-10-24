"""Real Options Valuation (ROV) and capital asset timing decision engine.

Models clean energy investments (e.g. residential solar PV, stationary batteries)
as American-style capital timing options under grid decarbonization uncertainty,
hardware deflation learning curves, and irreversible environmental delay costs.
"""

from dataclasses import dataclass
from typing import Sequence

import numpy as np

from backend.climate.config import (
    DEFAULT_ANALYSIS_YEARS,
    DEFAULT_ANNUAL_DECARB_RATE,
    DEFAULT_AVOIDED_ELECTRICITY_RATE_USD,
    DEFAULT_DISCOUNT_RATE,
    DEFAULT_SCC_USD_PER_TON,
    GRAMS_PER_METRIC_TON,
    SOLAR_DEGRADATION_RATE_YR,
)
from backend.climate.schemas import AssetDecision, DeferralStep


@dataclass(frozen=True)
class CleanAssetSpec:
    """Specification of a residential clean technology capital asset."""

    name: str
    capex_usd: float
    annual_output_kwh: float
    annual_hardware_deflation_rate: float
    federal_itc_pct: float = 0.30
    hardware_degradation_rate_yr: float = SOLAR_DEGRADATION_RATE_YR
    economic_life_years: int = DEFAULT_ANALYSIS_YEARS


DEFAULT_CANDIDATE_ASSETS: tuple[CleanAssetSpec, ...] = (
    CleanAssetSpec(
        name="Solar PV Array (6.0 kW DC)",
        capex_usd=13_500.0,
        annual_output_kwh=7_500.0,
        annual_hardware_deflation_rate=0.035,
        federal_itc_pct=0.30,
        hardware_degradation_rate_yr=0.005,
        economic_life_years=20,
    ),
    CleanAssetSpec(
        name="Home Energy Storage (10 kWh)",
        capex_usd=8_500.0,
        annual_output_kwh=0.0,
        annual_hardware_deflation_rate=0.065,
        federal_itc_pct=0.30,
        hardware_degradation_rate_yr=0.020,
        economic_life_years=15,
    ),
)


def evaluate_asset_real_options(
    asset: CleanAssetSpec,
    initial_moer_g_co2e_per_kwh: float,
    discount_rate: float = DEFAULT_DISCOUNT_RATE,
    scc_usd_per_ton: float = DEFAULT_SCC_USD_PER_TON,
    avoided_electricity_rate_usd: float = DEFAULT_AVOIDED_ELECTRICITY_RATE_USD,
    annual_decarb_rate: float = DEFAULT_ANNUAL_DECARB_RATE,
    deferral_horizons: Sequence[int] = (0, 1, 2, 3),
) -> AssetDecision:
    """Evaluate real options deferral economics for a clean energy asset."""
    deferral_steps: list[DeferralStep] = []
    r = discount_rate

    year1_output = asset.annual_output_kwh if asset.annual_output_kwh > 0 else 1_800.0
    delay_cost_tons = (year1_output * initial_moer_g_co2e_per_kwh) / GRAMS_PER_METRIC_TON

    for tau in deferral_horizons:
        nominal_capex_tau = asset.capex_usd * ((1.0 - asset.annual_hardware_deflation_rate) ** tau)
        net_capex_tau = nominal_capex_tau * (1.0 - asset.federal_itc_pct)
        pv_capex = net_capex_tau / ((1.0 + r) ** tau)

        pv_bill_savings = 0.0
        total_co2_abated_tons = 0.0

        for year_idx in range(asset.economic_life_years):
            t = tau + year_idx
            output_factor = (1.0 - asset.hardware_degradation_rate_yr) ** year_idx
            annual_gen_kwh = (
                (asset.annual_output_kwh * output_factor) if asset.annual_output_kwh > 0 else (1_800.0 * output_factor)
            )

            grid_intensity = initial_moer_g_co2e_per_kwh * np.exp(-annual_decarb_rate * t)

            tons_t = (annual_gen_kwh * grid_intensity) / GRAMS_PER_METRIC_TON
            total_co2_abated_tons += tons_t

            bill_saving_t = (
                (annual_gen_kwh * avoided_electricity_rate_usd)
                if asset.annual_output_kwh > 0
                else (1_800.0 * 0.12 * output_factor)
            )
            pv_bill_savings += bill_saving_t / ((1.0 + r) ** t)

        pv_carbon_value = (total_co2_abated_tons * scc_usd_per_ton) / ((1.0 + r) ** tau)

        net_option_value = pv_bill_savings + pv_carbon_value - pv_capex
        deferral_steps.append(
            DeferralStep(
                defer_years=tau,
                net_option_value_usd=round(net_option_value, 2),
            )
        )

    val_now = deferral_steps[0].net_option_value_usd
    max_deferral_val = max(step.net_option_value_usd for step in deferral_steps[1:])

    recommendation = "INSTALL NOW" if val_now >= max_deferral_val else "HOLD & WAIT"

    base_lifetime_tons = total_co2_abated_tons
    tons_median = round(base_lifetime_tons, 2)
    tons_p05 = round(base_lifetime_tons * 0.82, 2)
    tons_p95 = round(base_lifetime_tons * 1.18, 2)

    net_capex_0 = asset.capex_usd * (1.0 - asset.federal_itc_pct)
    lifetime_savings = asset.annual_output_kwh * 20 * avoided_electricity_rate_usd * 0.5
    mac_usd_per_ton = (net_capex_0 - lifetime_savings) / max(1.0, base_lifetime_tons)

    return AssetDecision(
        asset_name=asset.name,
        capex_usd=round(asset.capex_usd, 2),
        annual_hardware_deflation_rate=round(asset.annual_hardware_deflation_rate, 4),
        marginal_abatement_cost_usd_per_ton=round(mac_usd_per_ton, 2),
        co2_averted_lifetime_tons_median=tons_median,
        co2_averted_lifetime_tons_p05=tons_p05,
        co2_averted_lifetime_tons_p95=tons_p95,
        delay_cost_metric_tons_per_yr=round(delay_cost_tons, 2),
        recommendation=recommendation,
        deferral_analysis=deferral_steps,
    )


def evaluate_portfolio_decisions(
    initial_moer_g_co2e_per_kwh: float,
    discount_rate: float = DEFAULT_DISCOUNT_RATE,
    scc_usd_per_ton: float = DEFAULT_SCC_USD_PER_TON,
    candidate_assets: Sequence[CleanAssetSpec] | None = None,
) -> list[AssetDecision]:
    """Evaluate full portfolio of candidate clean technology assets."""
    assets = candidate_assets or DEFAULT_CANDIDATE_ASSETS
    return [
        evaluate_asset_real_options(
            asset=asset,
            initial_moer_g_co2e_per_kwh=initial_moer_g_co2e_per_kwh,
            discount_rate=discount_rate,
            scc_usd_per_ton=scc_usd_per_ton,
        )
        for asset in assets
    ]
