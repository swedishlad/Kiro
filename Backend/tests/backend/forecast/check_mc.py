#!/usr/bin/env python3
"""Monte Carlo part of gate G-FC (docs/specs/mc-forecast.md §4). Run from the kit root."""
import datetime as dt
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.getcwd())
from backend.common import ZONES, add_month, build_path, load_daily, with_ma, zone_population  # noqa: E402
from backend.forecast import mc  # noqa: E402
from backend.regimes.hmm import stationary  # noqa: E402

ok = True


def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")


doc = json.load(open(build_path("mc_forecast.json")))
days, gwh, temp = load_daily()
gwh, temp = with_ma(gwh, temp, zone_population())
start, end = mc.horizon(days[-1])
want = [f"{add_month(start, k):%Y-%m}" for k in range(mc.N_MONTHS)]
check(f"horizon = the 6 full months after the last observed day ({days[-1]})", doc["horizon"] == want,
      f"{doc['horizon'][0]} .. {doc['horizon'][-1]}")
check("10,000 paths, seeded", doc["nPaths"] == 10000 and doc["seed"] == mc.SEED)
check("no level fudge: load is observed to the last day", doc["levelAdjustment"] == {"source": "none: observed load", "ratio": 1.0})
cal = mc.date_range(start, end)
years = mc.weather_years(days, start.month, len(cal))
check("weather bootstrap draws on >= 6 past years", len(years) >= 6, f"{years[0]}..{years[-1]}")
for a in doc["areas"]:
    zs = ZONES if a["area"] == "MA" else [a["area"]]
    obs = [sum(gwh[z][[(d.year, d.month) == (int(ym[:4]) - 1, int(ym[5:])) for d in days]].sum() for z in zs) for ym in doc["horizon"]]
    check(f"{a['area']}: 'same months last year' = the load observed a year earlier", np.allclose(obs, a["sameMonthsLastObservedGWh"], atol=0.01))
qk = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]
for a in doc["areas"]:
    good = all(all(m[x] <= m[y] for x, y in zip(qk, qk[1:])) for m in a["months"])
    check(f"{a['area']}: monthly quantiles ordered", good)
zones = {a["area"]: np.array(a["samplePaths"]) for a in doc["areas"]}
check("MA sample paths = sum of zone paths (same draws)", np.allclose(zones["MA"], sum(zones[z] for z in ZONES), atol=0.01))
c = doc["calibration"]
check("calibration: 36 zone-months, walk-forward from 2021-10-31", c["nMonths"] == 36 and c["trainEnd"] == "2021-10-31",
      f"cov80 {c['cov80']} cov90 {c['cov90']} MAE vs naive {c['maeVsNaive']}")
bt = doc["backtest"]
check("backtest: every complete winter since 2019-20, refit before each", bt["nWinters"] == len(mc.backtest_winters(days)) >= 7
      and bt["nMonths"] == 18 * bt["nWinters"], f"{bt['winters']}: cov80 {bt['cov80']} MAE vs naive {bt['maeVsNaive']} "
      f"6-month |error| {bt['totalMaePct']}% (bias {bt['totalBiasPct']:+}%)")

# reproducibility: same seed -> identical simulation
betas, regs, levels, level_sd = mc.fit_inputs(days, gwh, temp, days[-1])
temps = mc.season_temps(days, temp, years, len(cal), start.month)
s1 = mc.simulate(np.random.default_rng(1), cal, years, temps, betas, regs, levels, 300, level_sd)
s2 = mc.simulate(np.random.default_rng(1), cal, years, temps, betas, regs, levels, 300, level_sd)
check("same seed -> identical paths", all(np.array_equal(s1[z], s2[z]) for z in ZONES))
check("HMM residual centred: level is carried only by recentLevel", all(abs(stationary(regs[z]["A"]) @ regs[z]["mu"]) < 1e-9 for z in ZONES))
check("recentLevel = 1 + mean residual of the last 365 days, in the doc",
      all(abs(doc["recentLevel"][z] - levels[z]) < 1e-4 and abs(doc["levelSdPct"][z] - level_sd[z]) < 1e-3 for z in ZONES),
      str(doc["recentLevel"]))

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
