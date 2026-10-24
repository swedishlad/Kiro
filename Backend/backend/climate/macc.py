"""Marginal Abatement Cost Curve (MACC) calculator.

Generates a ranked schedule of household carbon interventions sorted by levelized
abatement cost ($/metric ton CO2e), preserving negative-cost (cost-saving) actions.
"""

from backend.climate.schemas import MACCItem


def build_macc_curve(
    arbitrage_annual_tons_abated: float,
    arbitrage_annual_savings_usd: float,
    has_battery: bool = False,
    battery_annual_tons_abated: float = 0.0,
    battery_annual_savings_usd: float = 0.0,
) -> list[MACCItem]:
    """Construct the ranked Marginal Abatement Cost Curve."""
    interventions: list[MACCItem] = []

    # 1. Operational EV & Appliance Smart Load Shifting (Zero CapEx)
    if arbitrage_annual_tons_abated > 1e-4:
        savings = max(15.0, arbitrage_annual_savings_usd)
        cost_per_ton = -(savings / arbitrage_annual_tons_abated)
        interventions.append(
            MACCItem(
                intervention_name="Smart EV & major appliance overnight load shift",
                abatement_cost_usd_per_ton=round(cost_per_ton, 2),
                annual_tons_abated=round(arbitrage_annual_tons_abated, 3),
                annual_net_financial_savings_usd=round(savings, 2),
            )
        )
    else:
        interventions.append(
            MACCItem(
                intervention_name="Automated evening peak load shifting (EV / laundry)",
                abatement_cost_usd_per_ton=-45.0,
                annual_tons_abated=0.18,
                annual_net_financial_savings_usd=81.0,
            )
        )

    # 2. Smart Thermostat Dynamic Thermal Pre-Heating/Cooling
    thermostat_tons = 0.14
    thermostat_savings = 55.0
    thermostat_net_cost = 30.0 - thermostat_savings
    interventions.append(
        MACCItem(
            intervention_name="Smart thermostat emissions-aware thermal pre-conditioning",
            abatement_cost_usd_per_ton=round(thermostat_net_cost / thermostat_tons, 2),
            annual_tons_abated=thermostat_tons,
            annual_net_financial_savings_usd=thermostat_savings,
        )
    )

    # 3. Energy Efficiency: Deep Air Sealing & Insulation Touch-up
    insulation_tons = 0.52
    insulation_savings = 115.0
    insulation_net_cost = 70.0 - insulation_savings
    interventions.append(
        MACCItem(
            intervention_name="Building envelope weatherization & air sealing",
            abatement_cost_usd_per_ton=round(insulation_net_cost / insulation_tons, 2),
            annual_tons_abated=insulation_tons,
            annual_net_financial_savings_usd=insulation_savings,
        )
    )

    # 4. Battery Clean Energy Peaker Displacement (if equipped)
    if has_battery and battery_annual_tons_abated > 1e-4:
        net_annual_capex = 350.0
        battery_net = net_annual_capex - battery_annual_savings_usd
        cost_per_ton = battery_net / battery_annual_tons_abated
        interventions.append(
            MACCItem(
                intervention_name="Home battery peaker displacement & reserve arbitrage",
                abatement_cost_usd_per_ton=round(cost_per_ton, 2),
                annual_tons_abated=round(battery_annual_tons_abated, 3),
                annual_net_financial_savings_usd=round(battery_annual_savings_usd, 2),
            )
        )

    valid_interventions = [item for item in interventions if item.annual_tons_abated > 0.0]
    valid_interventions.sort(key=lambda x: x.abatement_cost_usd_per_ton)
    return valid_interventions
