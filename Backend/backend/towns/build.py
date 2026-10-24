#!/usr/bin/env python3
"""D5 + D6: modeled consumption and the 6-month forecast for all 351 Massachusetts towns -> data/build/towns_metrics.json.

Spec: docs/specs/towns.md. Everything here is MODELED: no public town-level metered data exists. Each town gets its
population share of its (approximate, by county) ISO-NE zone:
  modeledAnnualMWh       = share x zone 2023 load x EIA all-sector level ratio (12 months to 2026-08 / 2023)
  modeledResidentialMWh  = population x MA residential kWh per person (EIA residential sales, 12 months to 2026-08)
  forecast6mMWh          = share x the zone's Monte Carlo 6-month total (mc_forecast.json), Nov 2026 - Apr 2027
  forecastMonthlyP50MWh  = share x the zone's monthly median path
  regimeColor            = the zone's current regime (regimes.json, as of its last data day)
Run from the backend root after the regimes and Monte Carlo builds:  python3 -m backend.towns.build
"""
import csv
import datetime as dt
import json

from backend.common import ZONES, build_path
from backend.forecast.mc import level_ratio

QK = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]


def main():
    towns = list(csv.DictReader(open(build_path("ma_towns.csv"), newline="")))
    zpop = {z: sum(int(t["pop2024"]) for t in towns if t["zone_approx"] == z) for z in ZONES}
    ma_pop = sum(zpop.values())
    level = level_ratio()
    daily = list(csv.DictReader(open(build_path("isone_ma_daily.csv"), newline="")))
    zload = {z: sum(float(r["rt_mwh"]) for r in daily if r["zone"] == z and r["date"].startswith("2023")) * level
             for z in ZONES}
    res = list(csv.DictReader(open(build_path("eia_ma_monthly.csv"), newline="")))
    res_l12 = sum(float(r["sales_mwh"]) for r in res
                  if (int(r["year"]), int(r["month"])) >= (2025, 9) and (int(r["year"]), int(r["month"])) <= (2026, 8))
    res_kwh_per_person = res_l12 * 1000 / ma_pop
    mc = {a["area"]: a for a in json.load(open(build_path("mc_forecast.json")))["areas"]}
    reg = {a["area"]: a for a in json.load(open(build_path("regimes.json")))["areas"]}
    out = []
    for t in sorted(towns, key=lambda r: int(r["town_id"])):
        z, pop = t["zone_approx"], int(t["pop2024"])
        share = pop / zpop[z]
        annual = zload[z] * share
        last = sum(mc[z]["sameMonthsLastObservedGWh"])
        out.append({
            "townId": int(t["town_id"]), "name": t["name"], "zone": z, "pop2024": pop,
            "modeledAnnualMWh": round(annual, 1),
            "modeledResidentialMWh": round(pop * res_kwh_per_person / 1000, 1),
            "perCapitaKwh": round(annual * 1000 / pop, 1) if pop else 0.0,
            "regimeColor": reg[z]["current"]["color"],
            "forecast6mMWh": {k: round(mc[z]["total"][k] * share * 1000, 1) for k in QK},
            "forecastMonthlyP50MWh": [round(m["p50"] * share * 1000, 1) for m in mc[z]["months"]],
            "changeVsLastYearPct": round((mc[z]["total"]["p50"] / last - 1) * 100, 2),
        })
    totals = {z: round(sum(o["modeledAnnualMWh"] for o in out if o["zone"] == z), 1) for z in ZONES}
    doc = {
        "asOf": dt.date.today().isoformat(),
        "method": "modeled: population share of zone",
        "zoneMapping": "approximate by county",
        "horizon": json.load(open(build_path("mc_forecast.json")))["horizon"],
        "towns": out,
        "zoneTotalsMWh": totals,
        "residentialKwhPerPerson": round(res_kwh_per_person, 1),
        "notes": [
            "Modeled, not metered: each town is its population share of its ISO-NE zone (no public town-level data exists).",
            "Zones are approximated by county (Middlesex -> NEMA, Norfolk -> SEMA); e.g. Brookline is counted in SEMA.",
            "All-customer load includes businesses, so commercial centres (downtown Boston) are understated and suburbs overstated.",
            "perCapitaKwh is the same for every town in a zone by construction.",
            f"Forecast = the zone's Monte Carlo (Nov 2026 - Apr 2027, level x {level}); regime colour = the zone's state on "
            f"{reg['NEMA']['current']['date']}.",
        ],
    }
    with open(build_path("towns_metrics.json"), "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    boston = next(o for o in out if o["name"] == "Boston")
    print(f"towns_metrics: {len(out)} towns · zone totals MWh {totals} · Boston 6-month p50 "
          f"{boston['forecast6mMWh']['p50']:,.0f} MWh ({boston['changeVsLastYearPct']:+.1f}% vs last year)")
    print("wrote", build_path("towns_metrics.json"))


if __name__ == "__main__":
    main()
