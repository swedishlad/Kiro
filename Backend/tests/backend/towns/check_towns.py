#!/usr/bin/env python3
"""Gate G-CITY (docs/specs/towns.md). Run from the backend root: python3 tests/backend/towns/check_towns.py"""
import json
import os
import sys

sys.path.insert(0, os.getcwd())
from backend.common import ZONES, build_path  # noqa: E402

ok = True


def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")


doc = json.load(open(build_path("towns_metrics.json")))
mc = {a["area"]: a for a in json.load(open(build_path("mc_forecast.json")))["areas"]}
try:
    from jsonschema import Draft202012Validator as V, FormatChecker as F
    errs = list(V(json.load(open("contracts/towns_metrics.schema.json")), format_checker=F()).iter_errors(doc))
    check("schema: 0 errors", not errs, f"{len(errs)} errors")
except ImportError:
    print("SKIP  schema (jsonschema not installed)")
towns = doc["towns"]
check("351 towns, ids 1..351", sorted(t["townId"] for t in towns) == list(range(1, 352)))
check("labelled modeled", doc["method"] == "modeled: population share of zone" and doc["zoneMapping"] == "approximate by county")
qk = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]
check("every forecast's quantiles are ordered", all(all(t["forecast6mMWh"][a] <= t["forecast6mMWh"][b] for a, b in zip(qk, qk[1:])) for t in towns))
for z in ZONES:
    s = sum(t["modeledAnnualMWh"] for t in towns if t["zone"] == z)
    check(f"{z}: towns add up to the zone total", abs(s - doc["zoneTotalsMWh"][z]) <= 0.5, f"{s:,.1f} vs {doc['zoneTotalsMWh'][z]:,.1f}")
    f50 = sum(t["forecast6mMWh"]["p50"] for t in towns if t["zone"] == z) / 1000
    check(f"{z}: town medians add up to the zone Monte Carlo median", abs(f50 - mc[z]["total"]["p50"]) < 0.5,
          f"{f50:,.1f} vs {mc[z]['total']['p50']:,.1f} GWh")
boston = next((t for t in towns if t["name"] == "Boston"), None)
check("Boston present with 2024 population 673,458", boston is not None and boston["pop2024"] == 673458)
check("monthly path has 6 months per town", all(len(t["forecastMonthlyP50MWh"]) == 6 for t in towns))
print("G-CITY:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
