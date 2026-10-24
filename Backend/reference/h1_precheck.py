#!/usr/bin/env python3
"""Pre-check of hypothesis H1: fixed term rate ~= simple mean of that term's monthly prices x (1+delta).

Descriptive only (in-sample). It does NOT make a forecast and does NOT prove the monthly prices were
known before the term started. Usage: python3 reference/h1_precheck.py   (stdlib only)
"""
import csv
import math
import os
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
SNAP = os.path.join(HERE, "..", "data", "snapshot")
COLS = ["NG", "NSTAR", "WMECo", "Unitil"]


def load(name):
    with open(os.path.join(SNAP, name)) as fh:
        rd = csv.reader(fh)
        next(rd)
        return [(int(r[0]), int(r[1]), [float(x) if x else None for x in r[2:6]]) for r in rd]


monthly = {(y, m): v for y, m, v in load("monthly_residential_cents_2026-07-02.csv")}
fixed = load("fixed_residential_cents_2026-07-02.csv")


def k(y, m):
    return y * 12 + m - 1


print(f"{'utility':7s} {'start':7s} {'end':7s} {'mo':>2s} {'fixed':>7s} {'mean_m':>7s} {'ratio-1':>8s}")
by_util = {c: [] for c in COLS}
for j, c in enumerate(COLS):
    ends = sorted((y, m, v[j]) for y, m, v in fixed if v[j] is not None)
    for (py, pm, _), (y, m, cents) in zip(ends, ends[1:]):
        s, e = k(py, pm) + 1, k(y, m)
        vals = [monthly.get((t // 12, t % 12 + 1), [None] * 4)[j] for t in range(s, e + 1)]
        if any(v is None for v in vals) or y < 2010:
            continue
        mean = sum(vals) / len(vals)
        r = cents / mean - 1
        by_util[c].append((y, m, len(vals), r))
        print(f"{c:7s} {s // 12}-{s % 12 + 1:02d} {y}-{m:02d} {len(vals):2d} {cents:7.3f} {mean:7.3f} {r * 100:+7.2f}%")

print("\nSummary, terms ending 2010-01 or later (ratio-1 in %):")
allr = []
for c in COLS:
    rs = [r for *_, r in by_util[c]]
    allr += rs
    print(f"  {c:7s} n={len(rs):2d} median={st.median(rs) * 100:+.2f} mean={st.mean(rs) * 100:+.2f} "
          f"min={min(rs) * 100:+.2f} max={max(rs) * 100:+.2f} sd={st.pstdev(rs) * 100:.2f}")
print(f"  ALL     n={len(allr)} median={st.median(allr) * 100:+.2f} mean={st.mean(allr) * 100:+.2f} "
      f"share within +/-3%: {sum(abs(r) <= 0.03 for r in allr) / len(allr) * 100:.0f}%")

# Size of a reset: term-to-term change of the fixed rate (what the no-skill M0 band is built from).
# Reported as SIMPLE percentage change (new/old - 1), the number a person understands; the log change
# (what models use) is shown alongside for mean absolute size.
print("\nTerm-to-term change of the fixed rate, terms ending 2010-01 or later (simple % = new/old - 1):")
for j, c in enumerate(COLS):
    ends = sorted((y, m, v[j]) for y, m, v in fixed if v[j] is not None)
    pairs = [(a[2], b[2]) for a, b in zip(ends, ends[1:]) if b[0] >= 2010]
    simple = sorted(b / a - 1 for a, b in pairs)
    logs = [math.log(b / a) for a, b in pairs]
    q = lambda p: simple[min(len(simple) - 1, max(0, round(p * (len(simple) - 1))))]
    print(f"  {c:7s} n={len(simple):2d} median={st.median(simple) * 100:+.1f}%  p10={q(.1) * 100:+.1f}%  "
          f"p90={q(.9) * 100:+.1f}%  mean|simple chg|={st.mean(map(abs, simple)) * 100:.1f}%  "
          f"mean|log chg|={st.mean(map(abs, logs)) * 100:.1f}")
