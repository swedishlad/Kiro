"""Pydantic v2 schemas for Climate Impact Portfolio API requests and responses."""

from typing import Literal

from pydantic import BaseModel, Field

# ==============================================================================
# Request Schemas
# ==============================================================================


class ClimateDashboardRequest(BaseModel):
    """Input payload for generating the complete Climate Impact Portfolio dashboard."""

    # Bill ingestion lookup reference (future-proofed)
    bill_id: str | None = Field(
        default=None,
        description="Optional ingested utility bill ID. If provided, overrides manual parameters.",
    )

    # Core bill consumption parameters
    total_monthly_kwh: float = Field(
        default=750.0,
        gt=0.0,
        description="Total electrical consumption for the billing period in kWh.",
    )
    zip_code: str = Field(
        default="02138",
        pattern=r"^\d{5}$",
        description="5-digit US ZIP code for regional grid node mapping (e.g. Cambridge, MA).",
    )
    utility_node: str | None = Field(
        default=None,
        description="Specific ISO sub-zone / nodal identifier if known (defaults to ISO-NE regional).",
    )
    hourly_usage_kwh: list[float] | None = Field(
        default=None,
        min_length=24,
        max_length=24,
        description="Explicit 24-hour baseline usage curve (kWh/hour). Synthesized if omitted.",
    )
    billing_days: int = Field(
        default=30,
        ge=28,
        le=31,
        description="Number of days in the representative billing cycle.",
    )

    # Operational flexibility and storage parameters
    shiftable_load_kwh: float = Field(
        default=6.0,
        ge=0.0,
        description="Amount of daily consumption that can be flexibly shifted (e.g., EV, heat pump, laundry).",
    )
    max_battery_capacity_kwh: float = Field(
        default=10.0,
        ge=0.0,
        description="Usable stationary battery capacity in kWh (0 if no storage).",
    )
    max_grid_draw_kw: float = Field(
        default=15.0,
        gt=0.0,
        description="Maximum household instantaneous grid draw constraint (kW).",
    )
    carbon_vs_cost_weight: float = Field(
        default=0.70,
        ge=0.0,
        le=1.0,
        description="Weight w in [0, 1] balancing carbon abatement (w=1.0) vs financial cost (w=0.0).",
    )
    scc_usd_per_ton: float = Field(
        default=190.0,
        gt=0.0,
        description="Social Cost of Carbon in USD per metric ton CO2e.",
    )

    # Monte Carlo simulation controls
    num_paths: int = Field(
        default=10_000,
        ge=100,
        le=100_000,
        description="Number of stochastic simulation paths for long-term grid decarbonization.",
    )
    mc_seed: int = Field(
        default=20261024,
        description="Deterministic PRNG seed for Monte Carlo reproducibility.",
    )


# ==============================================================================
# Response Schemas
# ==============================================================================


class ClimateSummary(BaseModel):
    """High-level executive metrics for household carbon footprint and liabilities."""

    current_annual_metric_tons: float = Field(
        description="Current annual carbon emissions under business-as-usual grid supply (metric tons CO2e)."
    )
    lifetime_co2_liability_metric_tons: float = Field(
        description="20-year undiscounted cumulative CO2e liability under business-as-usual."
    )
    best_case_reduction_pct: float = Field(
        description="Maximum achievable immediate emissions reduction percentage via load shifting and battery."
    )
    social_carbon_damage_yr_usd: float = Field(
        description="Monetized annual social damage caused by household emissions based on SCC."
    )
    portfolio_carbon_yield_pct: float = Field(
        description="Equivalent 'carbon dividend yield': annual metric tons abated per $1,000 CapEx invested."
    )


class HourlyPoint(BaseModel):
    """Emissions and load profile for an individual hour of the representative day."""

    hour: int = Field(ge=0, le=23, description="Hour of day (0-23).")
    baseline_load_kwh: float = Field(description="Baseline household demand in kWh.")
    optimized_load_kwh: float = Field(description="Optimized net grid load after shifting and battery.")
    emissions_intensity_g_co2e_per_kwh: float = Field(
        description="Marginal grid emissions intensity for this hour (g CO2e/kWh)."
    )


class MACCItem(BaseModel):
    """Entry on the Marginal Abatement Cost Curve (MACC)."""

    intervention_name: str = Field(description="Name of the efficiency or load-shifting action.")
    abatement_cost_usd_per_ton: float = Field(
        description="Net cost (or financial savings if negative) per metric ton of CO2e abated."
    )
    annual_tons_abated: float = Field(
        description="Annual metric tons of CO2e avoided by implementing this intervention."
    )
    annual_net_financial_savings_usd: float = Field(
        description="Direct annual electricity bill savings from the intervention."
    )


class NowArbitrageResponse(BaseModel):
    """Immediate operational load shifting and dispatch results."""

    average_grid_intensity_g_co2e_per_kwh: float = Field(
        description="24-hour mean grid emissions intensity (g CO2e/kWh)."
    )
    marginal_peak_intensity_g_co2e_per_kwh: float = Field(
        description="Highest hourly marginal grid emissions intensity in the profile."
    )
    schedulable_reductions_annual_metric_tons: float = Field(
        description="Total annual carbon abatement unlocked by optimal 24-hr scheduling."
    )
    hourly_series: list[HourlyPoint] = Field(
        description="24-hour timeline of baseline vs optimized dispatch and grid MOER."
    )
    macc_curve: list[MACCItem] = Field(description="Ranked marginal abatement cost curve interventions.")


class FanChartResponse(BaseModel):
    """Monte Carlo long-term trajectory quantiles (P05, Median, P95)."""

    years: list[int] = Field(description="Years elapsed from current baseline (1 to 20).")
    median_tons: list[float] = Field(description="Median remaining annual carbon footprint (P50).")
    p05_lower_bound_tons: list[float] = Field(description="Optimistic grid decarbonization bound (P05).")
    p95_upper_bound_tons: list[float] = Field(description="Pessimistic grid decarbonization bound (P95).")


class DeferralStep(BaseModel):
    """Analysis for deferring capital investment by tau years."""

    defer_years: int = Field(description="Years deferred (0 = deploy immediately).")
    net_option_value_usd: float = Field(
        description="Net present economic + social option value associated with this timing."
    )


class AssetDecision(BaseModel):
    """Real Options Valuation (ROV) and timing analysis for long-term capital assets."""

    asset_name: str = Field(description="Name and capacity of candidate asset (e.g. Solar 6kW).")
    capex_usd: float = Field(description="Unsubsidized turnkey capital expenditure in USD.")
    annual_hardware_deflation_rate: float = Field(
        description="Expected annual equipment cost deflation rate (learning curve)."
    )
    marginal_abatement_cost_usd_per_ton: float = Field(
        description="Levelized cost per ton abated over the asset lifetime."
    )
    co2_averted_lifetime_tons_median: float = Field(description="Median cumulative metric tons avoided.")
    co2_averted_lifetime_tons_p05: float = Field(description="Conservative 5th percentile tons avoided.")
    co2_averted_lifetime_tons_p95: float = Field(description="Optimistic 95th percentile tons avoided.")
    delay_cost_metric_tons_per_yr: float = Field(
        description="Irreversible metric tons of emissions released by waiting one year."
    )
    recommendation: Literal["INSTALL NOW", "HOLD & WAIT"] = Field(
        description="Optimal timing recommendation based on real options analysis."
    )
    deferral_analysis: list[DeferralStep] = Field(
        description="Option value trajectory across deferral horizons (0, 1, 2, 3 years)."
    )


class LaterDecisionsResponse(BaseModel):
    """Long-term structural asset investments and grid decarbonization fan chart."""

    fan_chart: FanChartResponse = Field(description="20-year stochastic Monte Carlo decarbonization bounds.")
    assets: list[AssetDecision] = Field(description="Real options valuation for clean technology capital assets.")


class ClimateMetadata(BaseModel):
    """System diagnostic, provenance, and execution telemetry."""

    data_source_mode: str = Field(
        description="Data provenance mode (e.g., 'live_lme_api' or 'regional_iso_ne_fallback')."
    )
    mc_paths: int = Field(description="Number of Monte Carlo paths executed.")
    mc_seed: int = Field(description="PRNG seed used.")
    compute_ms: float = Field(description="Total server-side computational latency in milliseconds.")


class ClimateDashboardResponse(BaseModel):
    """Complete, self-contained payload returned by POST /api/climate/dashboard."""

    summary: ClimateSummary
    now_arbitrage: NowArbitrageResponse
    later_decisions: LaterDecisionsResponse
    metadata: ClimateMetadata
