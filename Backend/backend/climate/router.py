"""FastAPI router for Climate Impact Portfolio API endpoints."""

import asyncio
import time

from fastapi import APIRouter, HTTPException, Request, status

from backend.climate.arbitrage import optimize_arbitrage
from backend.climate.lme_client import fetch_moer_profile
from backend.climate.load_profile import validate_or_synthesize_hourly
from backend.climate.macc import build_macc_curve
from backend.climate.mc_decarb import build_fan_chart_response, run_monte_carlo_decarbonization
from backend.climate.rov import evaluate_portfolio_decisions
from backend.climate.schemas import (
    ClimateDashboardRequest,
    ClimateDashboardResponse,
    ClimateMetadata,
    ClimateSummary,
    HourlyPoint,
    LaterDecisionsResponse,
    NowArbitrageResponse,
)
from backend.climate.valuation import (
    calculate_annual_emissions_metric_tons,
    calculate_daily_emissions_metric_tons,
    calculate_lifetime_co2_liability,
    calculate_portfolio_carbon_yield_pct,
    calculate_social_carbon_damage,
)

router = APIRouter(tags=["Climate Impact Portfolio"])


@router.get("/climate/health", status_code=status.HTTP_200_OK)
async def climate_health():
    """Health check endpoint for Climate Portfolio services."""
    return {"status": "ok", "service": "climate-impact-portfolio"}


@router.post(
    "/climate/dashboard",
    response_model=ClimateDashboardResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate full Climate Impact Portfolio analysis",
)
async def generate_climate_dashboard(
    payload: ClimateDashboardRequest,
    request: Request,
) -> ClimateDashboardResponse:
    """Generate comprehensive 24-hour dispatch arbitrage, MACC curve, Monte Carlo

    grid decarbonization fan chart, and real options capital timing portfolio.
    """
    t_start = time.perf_counter()

    if payload.bill_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utility bill '{payload.bill_id}' not found in local ingestion registry. "
            "Please provide direct total_monthly_kwh and zip_code parameters.",
        )

    try:
        hourly_kwh = validate_or_synthesize_hourly(
            hourly_usage_kwh=payload.hourly_usage_kwh,
            total_monthly_kwh=payload.total_monthly_kwh,
            billing_days=payload.billing_days,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid load profile parameters: {exc}",
        ) from exc

    http_client = getattr(request.app.state, "http_client", None) if hasattr(request, "app") else None
    moer_profile = await fetch_moer_profile(
        zip_code=payload.zip_code,
        client=http_client,
        utility_node=payload.utility_node,
    )
    moer_series = moer_profile.moer_g_co2e_per_kwh
    avg_moer = float(sum(moer_series) / len(moer_series))
    peak_moer = float(max(moer_series))

    annual_kwh = (payload.total_monthly_kwh / payload.billing_days) * 365.0

    def _compute_arbitrage_and_macc():
        arb = optimize_arbitrage(
            baseline_load_kwh=hourly_kwh,
            hourly_moer_g_co2e_per_kwh=moer_series,
            shiftable_load_kwh=payload.shiftable_load_kwh,
            max_battery_capacity_kwh=payload.max_battery_capacity_kwh,
            max_grid_draw_kw=payload.max_grid_draw_kw,
            carbon_vs_cost_weight=payload.carbon_vs_cost_weight,
            scc_usd_per_ton=payload.scc_usd_per_ton,
        )
        has_battery = payload.max_battery_capacity_kwh > 0
        bat_savings_kwh = sum(arb.battery_discharge_kwh)
        bat_annual_tons = (bat_savings_kwh * (avg_moer / 1e6)) * 365.0 if has_battery else 0.0
        bat_annual_savings = (bat_savings_kwh * 0.12) * 365.0 if has_battery else 0.0

        macc = build_macc_curve(
            arbitrage_annual_tons_abated=arb.annual_tons_abated,
            arbitrage_annual_savings_usd=arb.annual_financial_savings_usd,
            has_battery=has_battery,
            battery_annual_tons_abated=bat_annual_tons,
            battery_annual_savings_usd=bat_annual_savings,
        )
        return arb, macc

    def _compute_mc_and_rov():
        mc_res = run_monte_carlo_decarbonization(
            initial_moer_g_co2e_per_kwh=avg_moer,
            annual_kwh=annual_kwh,
            solar_kwh_yr=0.0,
            battery_kwh=payload.max_battery_capacity_kwh,
            num_paths=payload.num_paths,
            num_years=20,
            base_seed=payload.mc_seed,
        )
        fan_chart = build_fan_chart_response(mc_res, num_years=20)
        asset_decisions = evaluate_portfolio_decisions(
            initial_moer_g_co2e_per_kwh=avg_moer,
            scc_usd_per_ton=payload.scc_usd_per_ton,
        )
        return fan_chart, asset_decisions

    (arbitrage_res, macc_items), (fan_chart_res, asset_decisions) = await asyncio.gather(
        asyncio.to_thread(_compute_arbitrage_and_macc),
        asyncio.to_thread(_compute_mc_and_rov),
    )

    daily_emissions_tons = calculate_daily_emissions_metric_tons(hourly_kwh, moer_series)
    annual_emissions_tons = calculate_annual_emissions_metric_tons(daily_emissions_tons)
    lifetime_liability_tons = calculate_lifetime_co2_liability(annual_emissions_tons)
    social_damage_usd = calculate_social_carbon_damage(annual_emissions_tons, payload.scc_usd_per_ton)

    best_case_reduction_pct = (
        (arbitrage_res.daily_emissions_saved_grams / max(1e-6, arbitrage_res.baseline_daily_emissions_grams)) * 100.0
        if arbitrage_res.baseline_daily_emissions_grams > 0
        else 0.0
    )

    solar_asset = next((a for a in asset_decisions if "Solar" in a.asset_name), asset_decisions[0])
    annual_clean_tons = solar_asset.co2_averted_lifetime_tons_median / 20.0
    portfolio_carbon_yield = calculate_portfolio_carbon_yield_pct(
        annual_tons_abated=annual_clean_tons + arbitrage_res.annual_tons_abated,
        benchmark_capex_usd=solar_asset.capex_usd,
    )

    summary = ClimateSummary(
        current_annual_metric_tons=round(annual_emissions_tons, 2),
        lifetime_co2_liability_metric_tons=round(lifetime_liability_tons, 2),
        best_case_reduction_pct=round(best_case_reduction_pct, 1),
        social_carbon_damage_yr_usd=round(social_damage_usd, 2),
        portfolio_carbon_yield_pct=portfolio_carbon_yield,
    )

    hourly_series = [
        HourlyPoint(
            hour=h,
            baseline_load_kwh=round(arbitrage_res.baseline_load_kwh[h], 3),
            optimized_load_kwh=round(arbitrage_res.optimized_load_kwh[h], 3),
            emissions_intensity_g_co2e_per_kwh=round(arbitrage_res.hourly_moer_g_co2e_per_kwh[h], 1),
        )
        for h in range(24)
    ]

    now_arbitrage = NowArbitrageResponse(
        average_grid_intensity_g_co2e_per_kwh=round(avg_moer, 1),
        marginal_peak_intensity_g_co2e_per_kwh=round(peak_moer, 1),
        schedulable_reductions_annual_metric_tons=round(arbitrage_res.annual_tons_abated, 3),
        hourly_series=hourly_series,
        macc_curve=macc_items,
    )

    later_decisions = LaterDecisionsResponse(
        fan_chart=fan_chart_res,
        assets=asset_decisions,
    )

    t_end = time.perf_counter()
    compute_ms = round((t_end - t_start) * 1000.0, 1)

    metadata = ClimateMetadata(
        data_source_mode=moer_profile.data_source_mode,
        mc_paths=payload.num_paths,
        mc_seed=payload.mc_seed,
        compute_ms=compute_ms,
    )

    return ClimateDashboardResponse(
        summary=summary,
        now_arbitrage=now_arbitrage,
        later_decisions=later_decisions,
        metadata=metadata,
    )
