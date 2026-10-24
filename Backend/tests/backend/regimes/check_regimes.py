#!/usr/bin/env python3
"""Gate G-HMM (docs/specs/regimes.md). Run from the kit root: python3 tests/backend/regimes/check_regimes.py

Definition under test: red = above the historical average range, grey = within, green = below; range = average
+/- 1 sd of the same period in the previous 5 years (prior years only).
"""
import datetime as dt
import json
import os
import sys
from collections import Counter, defaultdict

import numpy as np

sys.path.insert(0, os.getcwd())
from backend.common import build_path, month_starts  # noqa: E402
from backend.regimes import build as B  # noqa: E402
from backend.regimes.hmm import emissions, filter_step  # noqa: E402

ok = True


def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")


# 1. forward filter = hand computation (2-state toy, 3 days)
A = np.array([[0.9, 0.1], [0.2, 0.8]])
b = emissions(np.array([0.0, 1.0, 1.0]), np.array([0.0, 1.0]), np.array([1.0, 1.0]))
p = np.array([0.5, 0.5]) * b[0]
p /= p.sum()
for t in (1, 2):
    p = filter_step(p, A, b[t])
check("forward filter matches hand computation", abs(p[1] - 0.564406) < 1e-6, f"P(state 2 | day 3) = {p[1]:.6f}")


def daily_states(days, x):
    mean, sd = B.daily_band(days, x)
    z = np.clip((x - mean) / sd, -B.Z_CLIP, B.Z_CLIP)
    return z, B.walk_forward_states(days, z, B.DAILY_FROM, month_starts(days, B.DAILY_FROM))


# 2a. leakage, daily: scramble load after t; range, z and filtered states up to t must be bit-identical
days, gwh, _ = B.load_all()
cut, stop = dt.date(2020, 6, 15), dt.date(2020, 9, 30)
keep = days <= stop
d2, x1 = days[keep], gwh["NEMA"][keep].copy()
x2 = x1.copy()
after = d2 > cut
x2[after] *= 1 + 0.05 * np.random.default_rng(7).standard_normal(after.sum())
z1, p1 = daily_states(d2, x1)
z2, p2 = daily_states(d2, x2)
upto = (d2 <= cut) & (d2 >= B.DAILY_FROM)
check("leakage (daily): range and z up to t unchanged", np.array_equal(z1[d2 <= cut], z2[d2 <= cut], equal_nan=True))
check("leakage (daily): filtered states up to t bit-identical", np.array_equal(p1[upto], p2[upto]),
      f"{int(upto.sum())} days compared, t = {cut}")
check("leakage test is sensitive (later days change)", not np.allclose(p1[after], p2[after]))
np.savez(os.path.join("docs", "img", "tests", "_hmm_leakage.npz"), days=np.array([d.isoformat() for d in d2]),
         p1=p1, p2=p2, cut=cut.isoformat())

# 2b. leakage, monthly (MA_RES): scramble months after 2021-06; earlier states identical
months, xm = B.load_residential()
mcut = dt.date(2021, 6, 1)
xm2 = xm.copy()
aft = np.array([m > mcut for m in months])
xm2[aft] *= 1.08
res = []
for series in (xm, xm2):
    mean, sd = B.monthly_band(months, series)
    z = np.clip((series - mean) / sd, -B.Z_CLIP, B.Z_CLIP)
    res.append(B.walk_forward_states(months, z, B.MONTHLY_FROM, list(range(len(months))), fixed_sd=B.MONTHLY_SD))
up = np.array([B.MONTHLY_FROM <= m <= mcut for m in months])
check("leakage (monthly): filtered states up to t bit-identical", np.array_equal(res[0][up], res[1][up]),
      f"{int(up.sum())} months compared, t = {mcut}")

# 3. artifact invariants
doc = json.load(open(build_path("regimes.json")))
check("leakageTest field is pass", doc["leakageTest"] == "pass")
for a in doc["areas"]:
    m = [s["meanSdFromAverage"] for s in a["states"]]
    shares = [s["shareOfDays"] for s in a["states"]]
    check(f"{a['area']}: states anchored below / within / above the range", m == [-1.5, 0.0, 1.5], str(m))
    check(f"{a['area']}: every state >= 5% of points", min(shares) >= 0.05, str(shares))
    check(f"{a['area']}: transition rows sum to 1", all(abs(sum(r) - 1) < 1e-9 for r in a["transition"]))
    check(f"{a['area']}: agrees with the plain above/within/below rule >= 75%", a["agreementWithBandRule"] >= 0.75,
          f"{a['agreementWithBandRule']:.0%}")
    cm = defaultdict(Counter)
    for e in a["timeline"]:
        cm[int(e["date"][5:7])][e["color"]] += 1
    red = [cm[mm]["red"] / sum(cm[mm].values()) for mm in range(1, 13)]
    check(f"{a['area']}: no calendar month is mostly red (not a season detector)", max(red) < 0.7,
          f"red share by month max {max(red):.2f}")
    if a["unit"] == "day":
        n = (days[-1] - B.DAILY_FROM).days + 1
        check(f"{a['area']}: daily timeline 2020-01-01 .. {days[-1]} (last data day), no gaps",
              a["timeline"][0]["date"] == "2020-01-01" and a["timeline"][-1]["date"] == days[-1].isoformat() and len(a["timeline"]) == n)
    else:
        check(f"{a['area']}: monthly timeline 2016-01 .. {months[-1]:%Y-%m} (last EIA month)",
              a["timeline"][0]["date"] == "2016-01-01" and a["timeline"][-1]["date"] == months[-1].isoformat())

# 4. future regime: tested forecaster, no look-ahead, honest method choice
zc = np.clip(np.nan_to_num(z), -B.Z_CLIP, B.Z_CLIP)
months, xm = B.load_residential()
mean, sd = B.monthly_band(months, xm)
zm = (xm - mean) / sd
vm = ~np.isnan(zm)
zmc = np.clip(np.nan_to_num(zm), -B.Z_CLIP, B.Z_CLIP)
i_cut = int(np.where([m == dt.date(2021, 6, 1) for m in months])[0][0])
full = B.ar_probs_at(zmc, vm, i_cut, 1, B.MIN_PAIRS["month"])
trunc = B.ar_probs_at(zmc[:i_cut + 1], vm[:i_cut + 1], i_cut, 1, B.MIN_PAIRS["month"])
check("forecast: AR(1) gap forecast at t ignores data after t", np.array_equal(full, trunc))
for a in doc["areas"]:
    for o in a["outlook"]:
        good = (o["method"] == "ar1-gap") == (o["skillVsLongRunMix"] > B.SKILL_MIN)
        check(f"{a['area']}: outlook +{o['days']}d uses the model only where it beat the long-run mix", good,
              f"{o['method']} skill {o['skillVsLongRunMix']:+.1%}")
homes = next(a for a in doc["areas"] if a["area"] == "MA_RES")
fc = homes.get("forecast", [])
check("MA_RES: 6-month forecast present, months follow the last data month",
      len(fc) == 6 and fc[0]["date"] == B.add_month(months[-1], 1).isoformat() and fc[-1]["date"] == B.add_month(months[-1], 6).isoformat(),
      f"{fc[0]['date'][:7]} .. {fc[-1]['date'][:7]}" if fc else "")
check("MA_RES: forecast probabilities sum to 1", all(abs(sum(f["probs"]) - 1) < 1e-9 for f in fc))

print("G-HMM:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
