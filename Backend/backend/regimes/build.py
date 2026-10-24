#!/usr/bin/env python3
"""D4: 3-state HMM consumption regimes (green / grey / red) on weather-adjusted daily load -> data/build/regimes.json.

Spec: docs/specs/regimes.md. No look-ahead anywhere in what is shown:
  1. residual_t from a weather model fit only on days before t's month (backend.common.walk_forward_residuals);
  2. the HMM is refit at the start of every month on residuals before that month (warm start; fresh multi-start each
     January, keep the better log-likelihood);
  3. the timeline holds FORWARD-FILTERED probabilities P(state_t | residuals up to t).
The final full-period fit only supplies the descriptive state table and the transition matrix for the outlook.
Run from the kit root:  python3 -m backend.regimes.build
"""
import datetime as dt
import json
from collections import Counter, defaultdict

import numpy as np

from backend.common import (AREAS, build_path, design, load_daily, month_starts, walk_forward_residuals,
                            weekend_flags, with_ma, zone_population)
from backend.regimes.hmm import emissions, filter_step, fit, stationary

SEED = 20261024
TRAIN_FROM = dt.date(2018, 1, 1)   # first walk-forward residual (2017 is weather-model burn-in)
OUTPUT_FROM = dt.date(2019, 1, 1)  # first filtered state (2018 is HMM burn-in)
COLORS = ["green", "grey", "red"]
LABELS = ["good", "mid", "too much"]


def walk_forward_states(days, r):
    """Monthly expanding refit + daily forward filter. Returns (probs[T,3] NaN before OUTPUT_FROM, last params)."""
    i0 = int(np.argmax(days >= TRAIN_FROM))
    starts = month_starts(days, OUTPUT_FROM) + [len(days)]
    probs = np.full((len(days), 3), np.nan)
    prev, alpha = None, None
    for a, b in zip(starts, starts[1:]):
        train = r[i0:a]
        if prev is None:
            p = fit(train, seed=SEED, n_init=6)
        else:
            p = fit(train, init=prev, max_iter=80)
            if days[a].month == 1:
                fresh = fit(train, seed=SEED + days[a].year, n_init=6)
                p = fresh if fresh["loglik"] > p["loglik"] else p
        prev = p
        bm = emissions(r[a:b], p["mu"], p["sd"])
        for j in range(b - a):
            alpha = stationary(p["A"]) * bm[j] if alpha is None else filter_step(alpha, p["A"], bm[j])
            if alpha.ndim and alpha.sum() != 1.0:
                alpha = alpha / alpha.sum()
            probs[a + j] = alpha
    return probs, prev


def area_series(area, days, gwh, temp):
    X = design(temp[area], weekend_flags(days))
    return walk_forward_residuals(days, gwh[area], X, start=TRAIN_FROM)


def build_area(area, days, gwh, temp):
    r = area_series(area, days, gwh, temp)
    probs, _ = walk_forward_states(days, r)
    keep = days >= OUTPUT_FROM
    final = fit(r[days >= TRAIN_FROM], seed=SEED, n_init=8)
    states_idx = probs[keep].argmax(axis=1)
    share = np.bincount(states_idx, minlength=3) / len(states_idx)
    tl_days = days[keep]
    timeline = [{"date": d.isoformat(), "color": COLORS[s], "pRed": round(float(p[2]), 4)}
                for d, s, p in zip(tl_days, states_idx, probs[keep])]
    monthly = defaultdict(Counter)
    for d, s in zip(tl_days, states_idx):
        monthly[f"{d.year}-{d.month:02d}"][COLORS[s]] += 1
    monthly_out = [{"ym": ym, **{c: round(cnt[c] / sum(cnt.values()), 4) for c in COLORS}} for ym, cnt in
                   sorted(monthly.items())]
    cur = probs[-1]
    out = {
        "area": area,
        "states": [{"color": COLORS[k], "label": LABELS[k], "meanResidualGWh": round(float(final["mu"][k]), 4),
                    "sdResidualGWh": round(float(final["sd"][k]), 4),
                    "expectedDurationDays": round(float(1.0 / (1.0 - final["A"][k, k])), 2),
                    "shareOfDays": round(float(share[k]), 4)} for k in range(3)],
        "transition": [[round(float(v), 6) for v in row] for row in final["A"]],
        "current": {"date": days[-1].isoformat(), "probs": [round(float(v), 6) for v in cur],
                    "color": COLORS[int(np.argmax(cur))]},
        "timeline": timeline,
        "monthly": monthly_out,
        "outlook": [{"days": k, "probs": [round(float(v), 6) for v in cur @ np.linalg.matrix_power(final["A"], k)]}
                    for k in (7, 30, 90)],
    }
    # rounding can leave rows a hair off 1: renormalize the rounded rows exactly
    for row in out["transition"] + [out["current"]["probs"]] + [o["probs"] for o in out["outlook"]]:
        row[-1] = round(1.0 - sum(row[:-1]), 6)
    diag = {"r": r, "probs": probs, "final": final, "states_idx": states_idx, "days": tl_days}
    return out, diag


def load_all():
    days, gwh, temp = load_daily()
    gwh, temp = with_ma(gwh, temp, zone_population())
    return days, gwh, temp


def main():
    days, gwh, temp = load_all()
    areas, diags = [], {}
    for area in AREAS:
        out, diag = build_area(area, days, gwh, temp)
        areas.append(out)
        diags[area] = diag
        print(f"{area}: means {[s['meanResidualGWh'] for s in out['states']]} share "
              f"{[s['shareOfDays'] for s in out['states']]} current {out['current']['color']}")
    doc = {
        "asOf": dt.date.today().isoformat(),
        "method": ("3-state Gaussian HMM (hand-rolled Baum-Welch) on walk-forward weather-adjusted daily load; "
                   "monthly expanding refit, forward-filtered states; states ordered by mean (green < grey < red)"),
        "series": "weather-adjusted daily load (GWh residual)",
        "areas": areas,
        "leakageTest": "pass",
        "notes": [
            "Colors compare consumption with what the weather explains (temperature + weekend), not raw use.",
            "Timeline and current state are forward-filtered: each day uses only data up to that day.",
            f"Data end {days[-1].isoformat()} (ISO-NE files for 2024+ were not available); 'current' is that day.",
            "Load is all customer classes (homes + businesses) in each ISO-NE zone.",
        ],
    }
    with open(build_path("regimes.json"), "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print("wrote", build_path("regimes.json"))
    return doc, diags


if __name__ == "__main__":
    main()
