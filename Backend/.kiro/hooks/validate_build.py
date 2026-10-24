#!/usr/bin/env python3
"""Kiro PostFileSave hook: validate every generated data/build/*.json against its JSON Schema.

Runs from the project root. Prints one line per file; exit 1 on any error, 0 otherwise (also when jsonschema is
missing, with a warning, so a missing dependency never stalls an agent). Beyond the schema it checks what a schema
cannot: P10 <= P50 <= P90 and the 12 monthly shares summing to 1.
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
PAIRS = {"rates.json": "rates", "towns.json": "towns", "forecast.json": "forecast",
         "estimate_model.json": "estimate_model", "usage_forecast.json": "usage_forecast",
         "stats.json": "stats", "regimes.json": "regimes", "mc_forecast.json": "mc_forecast",
         "towns_metrics.json": "towns_metrics"}
QK = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]


def q_ordered(q):
    return all(q[a] <= q[b] for a, b in zip(QK, QK[1:]))


def ordered(band):
    return band["p10"] <= band["p50"] <= band["p90"]


def extra(name, data):
    errs = []
    if name == "estimate_model.json":
        if abs(sum(data["shares"]) - 1) > 0.001:
            errs.append(f"shares sum to {sum(data['shares']):.4f}, expected 1 +/- 0.001")
        if not ordered(data["residualLog"]):
            errs.append("residualLog is not ordered p10 <= p50 <= p90")
    if name == "usage_forecast.json":
        errs += [f"factor month {f['month']} not ordered" for f in data["factor"] if not ordered(f)]
        errs += [] if sorted(f["month"] for f in data["factor"]) == list(range(1, 13)) else ["factor months are not 1..12"]
    if name == "forecast.json":
        errs += [f"{u}: p10/p50/p90 not ordered" for u, f in data["perUtility"].items() if not ordered(f)]
    if name == "regimes.json":
        for a in data["areas"]:
            m = [st["meanSdFromAverage"] for st in a["states"]]
            if not m[0] < m[1] < m[2]:
                errs.append(f"{a['area']}: state means not increasing green < grey < red")
            bad = [p["date"] for p in a["timeline"] if p["bandPct"] <= 0 or abs(sum(p["probs"]) - 1) > 1e-6][:3]
            errs += [f"{a['area']}: bad range or probs not summing to 1 on {bad}"] if bad else []
            errs += [f"{a['area']}: transition row {i} sums to {sum(r):.4f}" for i, r in enumerate(a["transition"])
                     if abs(sum(r) - 1) > 1e-6]
            if abs(sum(a["current"]["probs"]) - 1) > 1e-6:
                errs.append(f"{a['area']}: current probs do not sum to 1")
    if name == "mc_forecast.json":
        for a in data["areas"]:
            errs += [f"{a['area']} {m['ym']}: quantiles not ordered" for m in a["months"] if not q_ordered(m)]
            errs += [] if q_ordered(a["total"]) else [f"{a['area']}: total quantiles not ordered"]
    if name == "towns_metrics.json":
        for z, total in data["zoneTotalsMWh"].items():
            got = sum(t["modeledAnnualMWh"] for t in data["towns"] if t["zone"] == z)
            if abs(got - total) > max(1.0, 1e-6 * total):
                errs.append(f"{z}: towns sum to {got:.1f} MWh, zone total {total:.1f}")
        errs += [f"town {t['townId']}: forecast quantiles not ordered" for t in data["towns"] if not q_ordered(t["forecast6mMWh"])][:3]
        if sorted(t["townId"] for t in data["towns"]) != list(range(1, 352)):
            errs.append("townId values are not exactly 1..351")
    return errs


def main():
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError:
        print("validate_build: jsonschema not installed, skipping (pip install jsonschema==4.26.0)")
        return 0
    bad, seen = 0, 0
    for name, schema_name in PAIRS.items():
        path = os.path.join(ROOT, "data", "build", name)
        if not os.path.exists(path):
            continue
        seen += 1
        try:
            data = json.load(open(path))
            schema = json.load(open(os.path.join(ROOT, "contracts", f"{schema_name}.schema.json")))
            errs = [e.message[:120] for e in Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(data)]
            errs += extra(name, data) if not errs else []
        except (ValueError, OSError, KeyError) as exc:
            errs = [f"cannot check: {exc}"]
        print(f"validate_build: {name} {'ok' if not errs else 'FAIL'}")
        for e in errs[:5]:
            print(f"  - {e}")
        bad += bool(errs)
    if not seen:
        print("validate_build: no data/build/*.json yet")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
