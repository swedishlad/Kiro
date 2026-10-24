#!/usr/bin/env python3
"""Gate G-HMM (docs/specs/regimes.md §4). Run from the kit root: python3 tests/backend/regimes/check_regimes.py"""
import datetime as dt
import json
import os
import sys
from collections import Counter, defaultdict

import numpy as np

sys.path.insert(0, os.getcwd())
from backend.common import build_path  # noqa: E402
from backend.regimes import build as B  # noqa: E402
from backend.regimes.hmm import emissions, filter_step  # noqa: E402

ok = True


def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")


# 1. forward filter = hand computation (2-state toy, 3 days)
A = np.array([[0.9, 0.1], [0.2, 0.8]]); mu = np.array([0.0, 1.0]); sd = np.array([1.0, 1.0])
b = emissions(np.array([0.0, 1.0, 1.0]), mu, sd)
p = np.array([0.5, 0.5]) * b[0]; p /= p.sum()
for t in (1, 2):
    p = filter_step(p, A, b[t])
check("forward filter matches hand computation", abs(p[1] - 0.564406) < 1e-6, f"P(state 2 | day 3) = {p[1]:.6f}")

# 2. leakage: perturb load after day t; everything shown up to t must be bit-identical
days, gwh, temp = B.load_all()
cut, stop = dt.date(2020, 6, 15), dt.date(2020, 8, 31)
keep = days <= stop
d2 = days[keep]
g_orig = {k: v[keep].copy() for k, v in gwh.items()}
t_orig = {k: v[keep].copy() for k, v in temp.items()}
g_pert = {k: v.copy() for k, v in g_orig.items()}
rng = np.random.default_rng(7)
after = d2 > cut
for k in g_pert:
    g_pert[k][after] *= 1 + 0.05 * rng.standard_normal(after.sum())
r1 = B.area_series("NEMA", d2, g_orig, t_orig)
r2 = B.area_series("NEMA", d2, g_pert, t_orig)
p1, _ = B.walk_forward_states(d2, r1)
p2, _ = B.walk_forward_states(d2, r2)
upto = (d2 <= cut) & (d2 >= B.OUTPUT_FROM)
check("leakage: residuals up to t unchanged", np.array_equal(r1[d2 <= cut], r2[d2 <= cut], equal_nan=True))
check("leakage: filtered probabilities up to t bit-identical", np.array_equal(p1[upto], p2[upto]),
      f"{int(upto.sum())} days compared, t = {cut}")
check("leakage test is sensitive (later days do change)", not np.allclose(p1[after], p2[after]))
np.savez(os.path.join("docs", "img", "tests", "_hmm_leakage.npz"), days=np.array([d.isoformat() for d in d2]),
         p1=p1, p2=p2, cut=cut.isoformat())

# 3. artifact invariants
doc = json.load(open(build_path("regimes.json")))
check("leakageTest field is pass", doc["leakageTest"] == "pass")
for a in doc["areas"]:
    m = [s["meanResidualPct"] for s in a["states"]]
    shares = [s["shareOfDays"] for s in a["states"]]
    check(f"{a['area']}: green < grey < red", m[0] < m[1] < m[2], str(m))
    check(f"{a['area']}: every state >= 5% of days", min(shares) >= 0.05, str(shares))
    check(f"{a['area']}: transition rows sum to 1", all(abs(sum(r) - 1) < 1e-9 for r in a["transition"]))
    # 4. not a season detector: red must appear in every calendar month, and no month may be mostly red
    cm = defaultdict(Counter)
    for e in a["timeline"]:
        cm[int(e["date"][5:7])][e["color"]] += 1
    red = [cm[mm]["red"] / sum(cm[mm].values()) for mm in range(1, 13)]
    check(f"{a['area']}: red spread across the year (not seasonal)", min(red) > 0 and max(red) < 0.7,
          f"red share by month min {min(red):.2f} max {max(red):.2f}")
    check(f"{a['area']}: timeline is daily from 2019-01-01", a["timeline"][0]["date"] == "2019-01-01"
          and len(a["timeline"]) == 1826)

print("G-HMM:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
