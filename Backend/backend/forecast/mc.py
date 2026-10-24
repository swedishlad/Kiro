#!/usr/bin/env python3
"""D3: walk-forward-calibrated Monte Carlo, 6 months (2026-11 .. 2027-04), per MA load zone -> data/build/mc_forecast.json.

Spec: docs/specs/mc-forecast.md. Per path:
  weather   one historical Nov-Apr season (2017-18 .. 2022-23), shifted -7..+7 days, shared by all zones
  expected  rolling 2-year weather model (temperature, weekend, calendar month), the residual's definition of normal
  regimes   a 3-state HMM (tied sd) fit here on the zone's walk-forward residual in % vs that model, started from its
            stationary distribution; daily load = expected x (1 + residual% / 100). Not the regimes.json HMM, whose
            states are in sd from the historical average.
  level     x EIA all-sector sales, 12 months to 2026-08 / 2023 (= 1.0435): ISO-NE files stop at 2023-12
Calibration: fit everything on data <= 2021-10-31, simulate Nov 2021-Apr 2022 and Nov 2022-Apr 2023 on their real
calendars, score 36 zone-months. A leakage test proves those forecasts ignore data after the cut.
Run from the kit root after the regimes build:  python3 -m backend.forecast.mc
"""
import csv
import datetime as dt
import json

import numpy as np

from backend.common import (ZONES, build_path, design, fit_weather, load_daily, month_dummies,
                            walk_forward_residuals, weekend_flags, with_ma, zone_population)
from backend.regimes.hmm import fit as hmm_fit
from backend.regimes.hmm import stationary

SEED = 20261024
N_PATHS = 10_000
HORIZON_START, HORIZON_END = dt.date(2026, 11, 1), dt.date(2027, 4, 30)
SEASONS = list(range(2017, 2023))          # season y = Nov 1 y .. Apr 30 y+1
TRAIN_END = dt.date(2021, 10, 31)
TEST_WINDOWS = [(dt.date(2021, 11, 1), dt.date(2022, 4, 30)), (dt.date(2022, 11, 1), dt.date(2023, 4, 30))]
QK = [5, 10, 25, 50, 75, 90, 95]
SHIFT = 7


def date_range(a, b):
    return [a + dt.timedelta(i) for i in range((b - a).days + 1)]


def regressors(days, temps):
    """Expected-load regressors for (paths x days) temperatures on the given calendar days."""
    X = design(temps, weekend_flags(days))
    md = np.broadcast_to(month_dummies(days), temps.shape + (11,))
    return np.concatenate([X, md], axis=-1)


def level_ratio(path=None):
    rows = list(csv.DictReader(open(path or build_path("eia_ma_total_monthly.csv"), newline="")))
    pick = lambda f: sum(float(r["total_sales_mwh"]) for r in rows if f(int(r["year"]), int(r["month"])))
    return round(pick(lambda y, m: (y == 2025 and m >= 9) or (y == 2026 and m <= 8)) / pick(lambda y, m: y == 2023), 4)


def season_temps(days, temp, seasons, n_days):
    """{season: {zone: temps covering Nov 1 - SHIFT .. Nov 1 + n_days + SHIFT}}."""
    pos = {d: i for i, d in enumerate(days)}
    out = {}
    for y in seasons:
        i = pos[dt.date(y, 11, 1)] - SHIFT
        out[y] = {z: temp[z][i:i + n_days + 2 * SHIFT] for z in ZONES}
    return out


def simulate(rng, cal_days, seasons, temps_by_season, betas, regimes, level, n_paths):
    """Return {zone: daily GWh (paths x days)} for the calendar `cal_days`."""
    n = len(cal_days)
    s_idx = rng.integers(0, len(seasons), n_paths)
    shift = rng.integers(-SHIFT, SHIFT + 1, n_paths)
    cols = (SHIFT + shift)[:, None] + np.arange(n)[None, :]
    out = {}
    for z in ZONES:
        stack = np.stack([temps_by_season[y][z] for y in seasons])          # seasons x (n + 2*SHIFT)
        temps = stack[s_idx[:, None], cols]                                   # paths x days
        expected = regressors(cal_days, temps) @ betas[z]
        mu, sd, A = regimes[z]["mu"], regimes[z]["sd"], regimes[z]["A"]
        cum = np.cumsum(A, axis=1)
        state = rng.choice(3, size=n_paths, p=stationary(A))
        eps = np.empty((n_paths, n))
        for d in range(n):
            if d:
                u = rng.random(n_paths)
                state = (u[:, None] > cum[state]).sum(axis=1).clip(0, 2)
            eps[:, d] = mu[state] + sd[state] * rng.standard_normal(n_paths)
        out[z] = expected * (1.0 + eps / 100.0) * level
    return out


def monthly(cal_days, daily):
    """Sum days to calendar months -> (months list, paths x months)."""
    keys = sorted({(d.year, d.month) for d in cal_days})
    idx = np.array([keys.index((d.year, d.month)) for d in cal_days])
    return keys, np.stack([daily[:, idx == k].sum(axis=1) for k in range(len(keys))], axis=1)


def quantiles(x):
    q = np.percentile(x, QK, axis=0)
    return [{f"p{k}": round(float(v), 3) for k, v in zip(QK, col)} for col in np.atleast_2d(q.T)]


def fit_inputs(days, gwh, temp, end):
    """Expected-load betas (730 days to `end`) and tied 3-state HMMs on walk-forward residuals to `end`. No data after `end`."""
    keep = days <= end
    d, betas, regs = days[keep], {}, {}
    lo = max(0, len(d) - 730)
    for z in ZONES:
        y, t = gwh[z][keep], temp[z][keep]
        X = regressors(d, t)
        betas[z] = fit_weather(X[lo:], y[lo:])
        r = walk_forward_residuals(d, y, X, start=dt.date(2018, 1, 1), pct=True)  # %: simulate() divides by 100
        p = hmm_fit(r[d >= dt.date(2018, 1, 1)], seed=SEED, n_init=8, tied=True)
        regs[z] = {"mu": p["mu"], "sd": p["sd"], "A": p["A"]}
    return betas, regs


def calibration_forecasts(days, gwh, temp, n_paths=4000):
    """Forecast quantiles for the two test windows using only data <= TRAIN_END (deterministic given SEED)."""
    betas, regs = fit_inputs(days, gwh, temp, TRAIN_END)
    seasons = [y for y in SEASONS if dt.date(y + 1, 5, 7) <= TRAIN_END]
    out = []
    for w, (a, b) in enumerate(TEST_WINDOWS):
        cal = date_range(a, b)
        temps = season_temps(days, temp, seasons, len(cal))
        sim = simulate(np.random.default_rng(SEED + w), cal, seasons, temps, betas, regs, 1.0, n_paths)
        for z in ZONES:
            keys, m = monthly(cal, sim[z])
            out.append({"zone": z, "months": keys, "q": np.percentile(m, QK, axis=0)})
    return out, seasons


def actual_monthly(days, gwh, z, keys):
    return np.array([gwh[z][[(d.year, d.month) == k for d in days]].sum() for k in keys])


def score(days, gwh, fc):
    rows, inside80, inside90, err, naive = [], 0, 0, [], []
    for f in fc:
        act = actual_monthly(days, gwh, f["zone"], f["months"])
        prev = actual_monthly(days, gwh, f["zone"], [(y - 1, m) for y, m in f["months"]])
        q = dict(zip(QK, f["q"]))
        for j, k in enumerate(f["months"]):
            in80 = q[10][j] <= act[j] <= q[90][j]
            in90 = q[5][j] <= act[j] <= q[95][j]
            inside80 += in80
            inside90 += in90
            err.append(abs(q[50][j] - act[j]))
            naive.append(abs(prev[j] - act[j]))
            rows.append({"zone": f["zone"], "ym": f"{k[0]}-{k[1]:02d}", "actual": round(float(act[j]), 2),
                         "p10": round(float(q[10][j]), 2), "p50": round(float(q[50][j]), 2),
                         "p90": round(float(q[90][j]), 2), "naive": round(float(prev[j]), 2), "in80": bool(in80)})
    n = len(rows)
    return {"nMonths": n, "cov80": round(inside80 / n, 4), "cov90": round(inside90 / n, 4),
            "maeVsNaive": round(float(np.mean(err) / np.mean(naive)), 4)}, rows


def main():
    days, gwh, temp = load_daily()
    gwh, temp = with_ma(gwh, temp, zone_population())
    level = level_ratio()
    cal = date_range(HORIZON_START, HORIZON_END)
    betas, regs = fit_inputs(days, gwh, temp, days[-1])
    temps = season_temps(days, temp, SEASONS, len(cal))
    sim = simulate(np.random.default_rng(SEED), cal, SEASONS, temps, betas, regs, level, N_PATHS)
    last_obs = date_range(dt.date(2022, 11, 1), dt.date(2023, 4, 30))
    areas, ma_paths, ma_last = [], 0, 0
    for z in ZONES + ["MA"]:
        if z == "MA":
            paths, last = ma_paths, ma_last
        else:
            keys, paths = monthly(cal, sim[z])
            _, last = monthly(last_obs, gwh[z][[d in set(last_obs) for d in days]][None, :])
            last = last[0] * level
            ma_paths, ma_last = ma_paths + paths, ma_last + last
        months = [{"ym": f"{y}-{m:02d}", **q} for (y, m), q in zip(keys, quantiles(paths))]
        areas.append({"area": z, "unit": "GWh", "months": months, "total": quantiles(paths.sum(axis=1)[:, None])[0],
                      "samplePaths": [[round(float(v), 3) for v in row] for row in paths[:20]],
                      "sameMonthsLastObservedGWh": [round(float(v), 3) for v in last]})
    fc, cal_seasons = calibration_forecasts(days, gwh, temp)
    calib, rows = score(days, gwh, fc)
    doc = {
        "asOf": dt.date.today().isoformat(),
        "horizon": [f"{y}-{m:02d}" for y, m in keys],
        "nPaths": N_PATHS, "seed": SEED,
        "method": ("weather-season bootstrap (2017-18..2022-23, +/-7 days) x rolling 2-year weather model x 3-state HMM "
                   "regime-switching residual (tied sd) x EIA all-sector level ratio"),
        "levelAdjustment": {"source": "S15 all-sector", "ratio": level},
        "areas": areas,
        "calibration": {"trainEnd": TRAIN_END.isoformat(), "test": "2021-11..2022-04 and 2022-11..2023-04",
                        **calib},
        "notes": [
            "Regional load of all customer classes; ISO-NE data ends 2023-12, so the level is carried to 2026 by EIA sales.",
            f"Calibration fit only on data <= {TRAIN_END.isoformat()}, weather from seasons {cal_seasons[0]}-{cal_seasons[-1] + 1}.",
            "MA = the three zones summed per path; zone residuals are simulated independently (MA spread may be too narrow).",
        ],
    }
    with open(build_path("mc_forecast.json"), "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    with open(build_path("mc_calibration_rows.json"), "w") as fh:
        json.dump(rows, fh, indent=1)
    print("level ratio", level, "| calibration", doc["calibration"])
    for a in areas:
        print(a["area"], "6-month total p10/p50/p90:", a["total"]["p10"], a["total"]["p50"], a["total"]["p90"],
              "| last observed", round(sum(a["sameMonthsLastObservedGWh"]), 1))
    print("wrote", build_path("mc_forecast.json"))
    return doc


if __name__ == "__main__":
    main()
