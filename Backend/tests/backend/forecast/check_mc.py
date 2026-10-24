#!/usr/bin/env python3
"""Monte Carlo part of gate G-FC (docs/specs/mc-forecast.md §4). Run from the kit root."""
import datetime as dt
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.getcwd())
from backend.common import ZONES, build_path, load_daily, with_ma, zone_population  # noqa: E402
from backend.forecast import mc  # noqa: E402

ok = True


def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")


doc = json.load(open(build_path("mc_forecast.json")))
check("horizon is 2026-11 .. 2027-04", doc["horizon"] == ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"])
check("10,000 paths, seeded", doc["nPaths"] == 10000 and doc["seed"] == mc.SEED)
check("level ratio = EIA all-sector 1.0435", doc["levelAdjustment"]["ratio"] == 1.0435)
qk = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]
for a in doc["areas"]:
    good = all(all(m[x] <= m[y] for x, y in zip(qk, qk[1:])) for m in a["months"])
    check(f"{a['area']}: monthly quantiles ordered", good)
zones = {a["area"]: np.array(a["samplePaths"]) for a in doc["areas"]}
check("MA sample paths = sum of zone paths (same draws)", np.allclose(zones["MA"], sum(zones[z] for z in ZONES), atol=0.01))
c = doc["calibration"]
check("calibration: 36 zone-months, walk-forward from 2021-10-31", c["nMonths"] == 36 and c["trainEnd"] == "2021-10-31",
      f"cov80 {c['cov80']} cov90 {c['cov90']} MAE vs naive {c['maeVsNaive']}")

# reproducibility: same seed -> identical simulation
days, gwh, temp = load_daily()
gwh, temp = with_ma(gwh, temp, zone_population())
betas, regs = mc.fit_inputs(days, gwh, temp, days[-1])
cal = mc.date_range(mc.HORIZON_START, mc.HORIZON_END)
temps = mc.season_temps(days, temp, mc.SEASONS, len(cal))
s1 = mc.simulate(np.random.default_rng(1), cal, mc.SEASONS, temps, betas, regs, 1.0, 300)
s2 = mc.simulate(np.random.default_rng(1), cal, mc.SEASONS, temps, betas, regs, 1.0, 300)
check("same seed -> identical paths", all(np.array_equal(s1[z], s2[z]) for z in ZONES))

# leakage: perturb every value after TRAIN_END -> calibration forecasts identical
g_pert = {k: v.copy() for k, v in gwh.items()}
t_pert = {k: v.copy() for k, v in temp.items()}
after = days > mc.TRAIN_END
rng = np.random.default_rng(11)
for k in g_pert:
    g_pert[k][after] *= 1 + 0.05 * rng.standard_normal(after.sum())
    t_pert[k][after] += 3 * rng.standard_normal(after.sum())
f1, _ = mc.calibration_forecasts(days, gwh, temp, n_paths=400)
f2, _ = mc.calibration_forecasts(days, g_pert, t_pert, n_paths=400)
check("leakage: calibration forecasts ignore data after the cut", all(np.array_equal(a["q"], b["q"]) for a, b in zip(f1, f2)),
      f"{len(f1)} zone-windows compared")

print("G-FC (Monte Carlo):", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
