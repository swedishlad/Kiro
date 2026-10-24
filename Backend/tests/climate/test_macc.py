"""Unit tests for Marginal Abatement Cost Curve (MACC) generation."""

from backend.climate.macc import build_macc_curve


def test_macc_strictly_sorted_ascending():
    """All interventions on the MACC curve must be sorted by abatement_cost_usd_per_ton."""
    curve = build_macc_curve(
        arbitrage_annual_tons_abated=0.25,
        arbitrage_annual_savings_usd=90.0,
        has_battery=True,
        battery_annual_tons_abated=0.40,
        battery_annual_savings_usd=120.0,
    )
    assert len(curve) >= 3
    costs = [item.abatement_cost_usd_per_ton for item in curve]
    assert costs == sorted(costs), "MACC curve must be sorted in ascending order of cost per ton"


def test_negative_costs_preserved():
    """First interventions should have negative abatement cost (net economic savings)."""
    curve = build_macc_curve(
        arbitrage_annual_tons_abated=0.30,
        arbitrage_annual_savings_usd=110.0,
    )
    first_item = curve[0]
    assert first_item.abatement_cost_usd_per_ton < 0.0
    assert first_item.annual_net_financial_savings_usd > 0.0
    assert first_item.annual_tons_abated > 0.0


def test_zero_abatement_excluded():
    """Any intervention with zero carbon abatement must be excluded from the curve."""
    curve = build_macc_curve(
        arbitrage_annual_tons_abated=0.0,
        arbitrage_annual_savings_usd=0.0,
        has_battery=False,
    )
    for item in curve:
        assert item.annual_tons_abated > 0.0


def test_battery_intervention_present_when_equipped():
    """When a battery is present, the battery item should be included in the curve."""
    curve = build_macc_curve(
        arbitrage_annual_tons_abated=0.20,
        arbitrage_annual_savings_usd=80.0,
        has_battery=True,
        battery_annual_tons_abated=0.35,
        battery_annual_savings_usd=100.0,
    )
    battery_items = [i for i in curve if "battery" in i.intervention_name.lower()]
    assert len(battery_items) == 1
    assert battery_items[0].annual_tons_abated == 0.35


def test_battery_intervention_absent_when_not_equipped():
    """When no battery is present, battery intervention should not appear."""
    curve = build_macc_curve(
        arbitrage_annual_tons_abated=0.20,
        arbitrage_annual_savings_usd=80.0,
        has_battery=False,
    )
    battery_items = [i for i in curve if "battery" in i.intervention_name.lower()]
    assert len(battery_items) == 0
