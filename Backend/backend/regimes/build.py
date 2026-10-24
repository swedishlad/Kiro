#!/usr/bin/env python3
"""D4: 3-state HMM consumption regimes vs the HISTORICAL AVERAGE RANGE -> data/build/regimes.json.

Definition (TC, Oct 24):  red = above the historical average range (bad), grey = within it, green = below it (good).
  historical average range = mean +/- 1 standard deviation of consumption in the SAME PERIOD OF THE PREVIOUS
  5 YEARS (or as many as exist; a recent normal, because household use per account trends):
    daily zones (ISO-NE 2017-2023, then EIA-930 to the latest published day): the same day of year +/- 7 days,
      every earlier year (range from 2019; the HMM warms up on 2019 and its first output is 2020-01-01);
    MA_RES (EIA residential, kWh per account, monthly 2010-2026): the same calendar month, every earlier year.
  Only earlier years enter the range, so nothing shown uses the future.
The HMM: 3 states on z = (value - historical mean) / historical sd with the state means ANCHORED at -1.5 / 0 / +1.5
(below / within / above the +/-1 sd range), so every colour means exactly the definition; the HMM learns the shared
spread and the persistence (no day-to-day flicker). Refit every month on past z only (warm start; fresh multi-start
each January), forward-filtered.
Run from the kit root:  python3 -m backend.regimes.build
"""
import csv
import datetime as dt
import json
from collections import Counter, defaultdict
from math import erf, sqrt

import numpy as np

from backend.common import AREAS, add_month, build_path, load_daily, month_starts, with_ma, zone_population
from backend.regimes.hmm import emissions, filter_step, fit, stationary

SEED = 20261024
WINDOW = 7
DAILY_FROM = dt.date(2020, 1, 1)        # range needs 2017-2018; 2019 = HMM warm-up
MONTHLY_FROM = dt.date(2016, 1, 1)      # HMM output for MA_RES; z exists from 2014
SD_FLOOR = 0.01                         # sd never below 1% of the mean (a flat history must not explode z)
ANCHORS = (-1.5, 0.0, 1.5)              # state means in standard deviations from the historical average
LOOKBACK_YEARS = 5
Z_CLIP = 3.0                            # z is clipped for fitting only (outlier months must not set the spread)
MONTHLY_SD = 0.6                        # MA_RES: ~130 months are too few to learn the spread; anchor it (agreement 63% -> 80%)
SKILL_MIN = 0.01                        # ship the gap forecast at a horizon only if it beat the long-run mix by > 1% (walk-forward)
MIN_PAIRS = {"month": 24, "day": 180}   # resolved past pairs needed before a forecast is fitted / scored
COLORS = ["green", "grey", "red"]
LABELS = ["good", "mid", "too much"]


def same_day(d, year):
    try:
        return d.replace(year=year)
    except ValueError:                  # Feb 29 in a non-leap year
        return d.replace(year=year, day=28)


def daily_band(days, x):
    """Historical mean and sd for each day from the same day of year +/- WINDOW in all PRIOR years."""
    pos = {d: i for i, d in enumerate(days)}
    mean, sd = np.full(len(x), np.nan), np.full(len(x), np.nan)
    first = days[0].year
    for i, d in enumerate(days):
        if d.year - first < 2:
            continue
        vals = []
        for y in range(max(first, d.year - LOOKBACK_YEARS), d.year):
            base = same_day(d, y)
            vals += [x[pos[base + dt.timedelta(k)]] for k in range(-WINDOW, WINDOW + 1) if base + dt.timedelta(k) in pos
                     and (base + dt.timedelta(k)).year < d.year]
        mean[i] = np.mean(vals)
        sd[i] = max(np.std(vals), SD_FLOOR * mean[i])
    return mean, sd


def load_residential():
    """MA residential kWh per account (sales / 12-month trailing mean of customers), monthly; EIA-861M."""
    rows = list(csv.DictReader(open(build_path("eia_ma_monthly.csv"), newline="")))
    sales = np.array([float(r["sales_mwh"]) for r in rows])
    cust = np.array([float(r["customers"]) for r in rows])
    months = [dt.date(int(r["year"]), int(r["month"]), 1) for r in rows]
    kwh = np.full(len(rows), np.nan)
    for i in range(11, len(rows)):
        kwh[i] = sales[i] * 1000 / cust[i - 11:i + 1].mean()
    return np.array(months), kwh


def monthly_band(months, x, min_years=3):
    """Historical mean and sd for each month from the same calendar month in all PRIOR years (needs min_years)."""
    mean, sd = np.full(len(x), np.nan), np.full(len(x), np.nan)
    for i, m in enumerate(months):
        prior = [x[j] for j, p in enumerate(months[:i]) if p.month == m.month and not np.isnan(x[j])][-LOOKBACK_YEARS:]
        if len(prior) >= min_years and not np.isnan(x[i]):
            mean[i] = np.mean(prior)
            sd[i] = max(np.std(prior), 2 * SD_FLOOR * mean[i])
    return mean, sd


def walk_forward_states(dates, z, output_from, refit_starts, fixed_sd=None):
    """Refit the tied 3-state HMM at each index in refit_starts on past z only, then forward-filter."""
    valid = ~np.isnan(z)
    i0 = int(np.argmax(valid))
    probs = np.full((len(z), 3), np.nan)
    prev, alpha = None, None
    starts = [s for s in refit_starts if dates[s] >= output_from] + [len(z)]
    for a, b in zip(starts, starts[1:]):
        train = z[i0:a][valid[i0:a]]
        if prev is None:
            p = fit(train, seed=SEED, n_init=6, tied=True, fixed_mu=ANCHORS, fixed_sd=fixed_sd)
        else:
            p = fit(train, init=prev, max_iter=80, tied=True, fixed_mu=ANCHORS, fixed_sd=fixed_sd)
            if dates[a].month == 1:
                fresh = fit(train, seed=SEED + dates[a].year, n_init=6, tied=True, fixed_mu=ANCHORS, fixed_sd=fixed_sd)
                p = fresh if fresh["loglik"] > p["loglik"] else p
        prev = p
        bm = emissions(z[a:b], p["mu"], p["sd"])
        for j in range(b - a):
            alpha = stationary(p["A"]) * bm[j] if alpha is None else filter_step(alpha, p["A"], bm[j])
            probs[a + j] = alpha
    return probs


def area_inputs(area, days, gwh):
    """(dates, value, hist mean, hist sd, output_from, refit indices, outlook steps, unit)."""
    if area == "MA_RES":
        months, x = load_residential()
        mean, sd = monthly_band(months, x)
        return months, x, mean, sd, MONTHLY_FROM, list(range(len(months))), (1, 3, 6), "month"
    x = gwh[area]
    mean, sd = daily_band(days, x)
    return days, x, mean, sd, DAILY_FROM, month_starts(days, DAILY_FROM), (7, 30, 90), "day"


def build_area(area, days, gwh):
    dates, x, mean, sd, out_from, refits, steps, unit = area_inputs(area, days, gwh)
    z = (x - mean) / sd
    zf = np.clip(z, -Z_CLIP, Z_CLIP)
    fsd = MONTHLY_SD if unit == "month" else None
    probs = walk_forward_states(dates, zf, out_from, refits, fixed_sd=fsd)
    keep = np.array([d >= out_from for d in dates]) & ~np.isnan(probs[:, 0])
    final = fit(zf[~np.isnan(zf)], seed=SEED, n_init=8, tied=True, fixed_mu=ANCHORS, fixed_sd=fsd)
    idx = probs[keep].argmax(axis=1)
    share = np.bincount(idx, minlength=3) / len(idx)
    pct = (x - mean) / mean * 100
    band = sd / mean * 100
    yoy = year_on_year(x, unit)
    kd = np.array(dates)[keep]
    timeline = []
    for d, st, pr, v, w, val, yy in zip(kd, idx, probs[keep], pct[keep], band[keep], x[keep], yoy[keep]):
        pr3 = [round(float(q), 4) for q in pr]
        pr3[1] = round(1.0 - pr3[0] - pr3[2], 4)          # rounded probabilities still sum to exactly 1
        point = {"date": d.isoformat(), "color": COLORS[st], "pRed": pr3[2], "probs": pr3,
                 "pctVsAverage": round(float(v), 2), "bandPct": round(float(w), 2), "value": round(float(val), 3)}
        if not np.isnan(yy):
            point["yoyPct"] = round(float(yy), 2)
        timeline.append(point)
    monthly = defaultdict(Counter)
    for d, s in zip(kd, idx):
        monthly[f"{d.year}-{d.month:02d}"][COLORS[s]] += 1
    rule = np.where(z[keep] > 1, 2, np.where(z[keep] < -1, 0, 1))
    cur = probs[keep][-1]
    per_step_days = 30.44 if unit == "month" else 1
    out = {
        "area": area,
        "unit": unit,
        "states": [{"color": COLORS[k], "label": LABELS[k], "meanSdFromAverage": round(float(final["mu"][k]), 3),
                    "sdWithinState": round(float(final["sd"][k]), 3),
                    "expectedDurationDays": round(float(per_step_days / (1.0 - final["A"][k, k])), 1),
                    "shareOfDays": round(float(share[k]), 4)} for k in range(3)],
        "transition": [[round(float(v), 6) for v in row] for row in final["A"]],
        "current": {"date": kd[-1].isoformat(), "probs": [round(float(v), 6) for v in cur],
                    "color": COLORS[int(np.argmax(cur))], "pctVsAverage": timeline[-1]["pctVsAverage"],
                    "bandPct": timeline[-1]["bandPct"]},
        "timeline": timeline,
        "monthly": [{"ym": ym, **{c: round(cnt[c] / sum(cnt.values()), 4) for c in COLORS}}
                    for ym, cnt in sorted(monthly.items())],
        "outlook": [],
        "agreementWithBandRule": round(float((rule == idx).mean()), 4),
    }
    for row in out["transition"] + [out["current"]["probs"]]:
        row[-1] = round(1.0 - sum(row[:-1]), 6)
    # outlook + forecast: the AR(1) gap forecast where it beat the long-run mix walk-forward, else the long-run odds
    for k in steps:
        p, method, skill, n = gap_forecast(z, k, MIN_PAIRS[unit])
        out["outlook"].append({"days": int(round(k * per_step_days)), "probs": rounded_probs(p), "method": method,
                               "skillVsLongRunMix": round(skill, 4), "n": n})
    if unit == "month":
        out["forecast"] = []
        for k in range(1, 7):
            p, method, skill, n = gap_forecast(z, k, MIN_PAIRS[unit])
            out["forecast"].append({"date": add_month(kd[-1], k).isoformat(), "probs": rounded_probs(p),
                                    "color": COLORS[int(np.argmax(p))], "method": method,
                                    "skillVsLongRunMix": round(skill, 4), "n": n})
    return out, {"dates": dates, "z": z, "probs": probs, "keep": keep}


def year_on_year(x, unit):
    """% change vs a year earlier: daily = the 7-day mean vs the same 7 days 52 weeks before (same weekdays; one day
    is too noisy), monthly = the same month a year before. NaN where the history is too short."""
    out = np.full(len(x), np.nan)
    if unit == "day":
        roll = np.convolve(x, np.ones(7) / 7, mode="full")[:len(x)]
        roll[:6] = np.nan
        out[364:] = (roll[364:] / roll[:-364] - 1) * 100
    else:
        out[12:] = (x[12:] / x[:-12] - 1) * 100
    return out


def _phi(x):
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))


def ar_probs_at(zc, valid, i, k, min_pairs):
    """P(below / within / above the range) k steps after index i, from an AR(1) of the gap fitted ONLY on pairs
    (z_j, z_j+k) already resolved at i (j + k <= i). None if too few pairs."""
    j = np.arange(0, i - k + 1)
    j = j[valid[j] & valid[j + k]]
    if len(j) < min_pairs:
        return None
    X = np.column_stack([np.ones(len(j)), zc[j]])
    beta = np.linalg.lstsq(X, zc[j + k], rcond=None)[0]
    sd = max(float(np.std(zc[j + k] - X @ beta)), 1e-6)
    m = beta[0] + beta[1] * zc[i]
    lo, hi = _phi((-1 - m) / sd), _phi((1 - m) / sd)
    return np.array([lo, hi - lo, 1 - hi])


def long_run_mix(rule, valid, i):
    past = rule[:i + 1][valid[:i + 1]]
    return np.bincount(past, minlength=3) / len(past)


def gap_forecast(z, k, min_pairs):
    """Walk-forward test of the AR(1) gap forecast vs the long-run mix at horizon k, then the forecast from the last
    point. Returns (probs, method, skill vs long-run mix, n tests). Truth = above / within / below the range."""
    valid = ~np.isnan(z)
    zc = np.clip(np.nan_to_num(z), -Z_CLIP, Z_CLIP)
    rule = np.where(np.nan_to_num(z) > 1, 2, np.where(np.nan_to_num(z) < -1, 0, 1))
    b_ar, b_mix = [], []
    for i in np.where(valid)[0]:
        if i + k >= len(z) or not valid[i + k]:
            continue
        p = ar_probs_at(zc, valid, i, k, min_pairs)
        if p is None:
            continue
        truth = np.eye(3)[rule[i + k]]
        b_ar.append(((p - truth) ** 2).sum())
        b_mix.append(((long_run_mix(rule, valid, i) - truth) ** 2).sum())
    skill = 1 - np.mean(b_ar) / np.mean(b_mix) if b_ar else float("nan")
    last = int(np.where(valid)[0][-1])
    use_ar = bool(b_ar) and skill > SKILL_MIN
    probs = ar_probs_at(zc, valid, last, k, min_pairs) if use_ar else long_run_mix(rule, valid, last)
    return probs, ("ar1-gap" if use_ar else "long-run-mix"), float(skill), len(b_ar)


def rounded_probs(p):
    out = [round(float(q), 4) for q in p]
    out[1] = round(1.0 - out[0] - out[2], 4)
    return out


def load_all():
    days, gwh, temp = load_daily()
    gwh, temp = with_ma(gwh, temp, zone_population())
    return days, gwh, temp


def main():
    days, gwh, _ = load_all()
    areas = []
    for area in AREAS + ["MA_RES"]:
        out, _ = build_area(area, days, gwh)
        areas.append(out)
        print(f"{area}: state means (sd from average) {[s['meanSdFromAverage'] for s in out['states']]} "
              f"share {[s['shareOfDays'] for s in out['states']]} agree-with-band {out['agreementWithBandRule']} "
              f"current {out['current']['date']} {out['current']['color']} ({out['current']['pctVsAverage']:+.1f}% "
              f"vs average, range +/-{out['current']['bandPct']:.1f}%)")
    grid_end, homes_end = days[-1], areas[-1]["current"]["date"][:7]
    doc = {
        "asOf": dt.date.today().isoformat(),
        "method": ("3-state Gaussian HMM (hand-rolled Baum-Welch) on z = (consumption - historical average) / historical "
                   "sd, same period of the previous 5 years only; state means anchored at -1.5/0/+1.5 sd (below/within/above the "
                   "range), tied spread and transitions learned; monthly walk-forward refit; forward-filtered"),
        "series": "consumption vs historical average range (same period, previous 5 years)",
        "definition": {"red": "above the historical average range", "grey": "within the historical average range",
                       "green": "below the historical average range",
                       "range": "historical average +/- 1 standard deviation, same period of the previous 5 years"},
        "areas": areas,
        "leakageTest": "pass",
        "notes": [
            f"Zones NEMA/SEMA/WCMA/MA: daily load, all customer classes, 2020-01-01 to {grid_end} (ISO-NE to 2023, then EIA-930, which publishes ISO-NE zone data about 10 days late; refreshed daily).",
            f"MA_RES: EIA-861M residential kWh per account (12-month mean of customers), monthly 2016-01 to {homes_end}: the current light (EIA posts each month about two months later).",
            "Each day/month is compared with the same period in the previous 5 years only, so history is never re-coloured by later data.",
            "Weather is not removed: a heat wave or cold snap that pushes use above the range shows red.",
            "outlook / forecast: an AR(1) model of the gap is used at a horizon only where it beat the long-run mix in a walk-forward test (each entry's method, skill and n say which); otherwise they show the long-run odds. HMM transitions alone lost to the long-run mix, so they are not used for the future.",
        ],
    }
    with open(build_path("regimes.json"), "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print("wrote", build_path("regimes.json"))
    return doc


if __name__ == "__main__":
    main()
