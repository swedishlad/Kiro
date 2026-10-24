#!/usr/bin/env python3
"""D3: walk-forward-calibrated Monte Carlo, the 6 full months after the last observed day, per MA load zone
-> data/build/mc_forecast.json. The horizon moves forward by itself as the daily refresh (backend/live/) adds data.

Spec: docs/specs/mc-forecast.md. Per path:
  weather   the same 6 calendar months of one past year (every year whose window the data covers), shifted -7..+7
            days, shared by all zones
  expected  rolling 2-year weather model (temperature, weekend, calendar month), the residual's definition of normal
  regimes   a 3-state HMM (tied sd) fit here on the zone's walk-forward residual in % vs that model, centred on zero
            and started from its stationary distribution; daily load = expected x level x (1 + residual% / 100). Not
            the regimes.json HMM, whose states are in sd from the historical average.
  level     1 + the zone's mean walk-forward residual over the last 365 days: the 2-year model is centred a year back
            and lags a trend; this carries it to today. Each path also draws one level shock (shared by the zones),
            sd = how much that level moved over the following 6 months at every past month start: weather and
            day-to-day regimes alone left the bands too narrow (80% band held 69% of months, 6-month totals 43%,
            rolling backtest). Load itself is observed to the last published day (ISO-NE 2017-2023, then EIA-930),
            so the snapshot-era x1.0435 EIA ratio is retired.
Calibration: fit everything on data <= 2021-10-31, simulate Nov 2021-Apr 2022 and Nov 2022-Apr 2023 on their real
calendars, score 36 zone-months. A leakage test proves those forecasts ignore data after the cut.
Backtest: the same refit on Oct 31 before every complete winter since 2019-20 (it grows by one winter a year).
Run from the kit root after the regimes build:  python3 -m backend.forecast.mc
"""
import csv
import datetime as dt
import json

import numpy as np

from backend.common import (ZONES, add_month, build_path, design, fit_weather, load_daily, month_dummies, month_starts,
                            walk_forward_residuals, weekend_flags, with_ma, zone_population)
from backend.regimes.hmm import fit as hmm_fit
from backend.regimes.hmm import stationary

SEED = 20261024
N_PATHS = 10_000
N_MONTHS = 6
LEVEL_DAYS = 365
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
    """EIA all-sector sales, last 12 months / calendar 2023 (S15): how far today's load sits above ISO-NE's last year."""
    rows = list(csv.DictReader(open(path or build_path("eia_ma_total_monthly.csv"), newline="")))
    last12 = sorted(rows, key=lambda r: (int(r["year"]), int(r["month"])))[-12:]
    return round(sum(float(r["total_sales_mwh"]) for r in last12) /
                 sum(float(r["total_sales_mwh"]) for r in rows if r["year"] == "2023"), 4)


def horizon(last_day):
    """First and last day of the N_MONTHS full calendar months after the month of the last observed day."""
    return add_month(last_day, 1), add_month(last_day, N_MONTHS + 1) - dt.timedelta(1)


def weather_years(days, start_month, n_days):
    """Every year y whose window (start_month 1st of y - SHIFT .. + n_days + SHIFT) lies inside the data."""
    return [y for y in range(days[0].year, days[-1].year + 1)
            if dt.date(y, start_month, 1) - dt.timedelta(SHIFT) >= days[0]
            and dt.date(y, start_month, 1) + dt.timedelta(n_days + SHIFT - 1) <= days[-1]]


def season_temps(days, temp, seasons, n_days, start_month=11):
    """{season: {zone: temps covering start_month 1st - SHIFT .. + n_days + SHIFT}}."""
    pos = {d: i for i, d in enumerate(days)}
    out = {}
    for y in seasons:
        i = pos[dt.date(y, start_month, 1)] - SHIFT
        out[y] = {z: temp[z][i:i + n_days + 2 * SHIFT] for z in ZONES}
    return out


def simulate(rng, cal_days, seasons, temps_by_season, betas, regimes, level, n_paths, level_sd=None):
    """Return {zone: daily GWh (paths x days)} for the calendar `cal_days`. level / level_sd: scalar or {zone: value}."""
    n = len(cal_days)
    s_idx = rng.integers(0, len(seasons), n_paths)
    shift = rng.integers(-SHIFT, SHIFT + 1, n_paths)
    xi = rng.standard_normal(n_paths)                                         # one level shock per path, all zones
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
        lv = level[z] if isinstance(level, dict) else level
        sd_l = (level_sd or {}).get(z, 0.0)
        out[z] = expected * (1.0 + eps / 100.0) * (lv * (1.0 + sd_l * xi / 100.0))[:, None]
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
    """Expected-load betas (730 days to `end`), tied 3-state HMMs on walk-forward residuals to `end` (centred on zero),
    each zone's level (1 + mean residual over the last LEVEL_DAYS) and level sd (in %: at every past month start, the
    mean residual of the next 181 days minus that of the LEVEL_DAYS before; sd over those). No data after `end`."""
    keep = days <= end
    d, betas, regs, levels, level_sd = days[keep], {}, {}, {}, {}
    lo = max(0, len(d) - 730)
    for z in ZONES:
        y, t = gwh[z][keep], temp[z][keep]
        X = regressors(d, t)
        betas[z] = fit_weather(X[lo:], y[lo:])
        r = walk_forward_residuals(d, y, X, start=dt.date(2018, 1, 1), pct=True)  # %: simulate() divides by 100
        p = hmm_fit(r[d >= dt.date(2018, 1, 1)], seed=SEED, n_init=8, tied=True)
        regs[z] = {"mu": p["mu"] - stationary(p["A"]) @ p["mu"], "sd": p["sd"], "A": p["A"]}
        levels[z] = 1.0 + float(np.nanmean(r[-LEVEL_DAYS:])) / 100.0
        i0 = int(np.argmax(~np.isnan(r)))
        moves = [np.mean(r[i:i + 181]) - np.mean(r[i - LEVEL_DAYS:i]) for i in month_starts(d, d[0])
                 if i - LEVEL_DAYS >= i0 and i + 181 <= len(r)]
        level_sd[z] = float(np.std(moves)) if len(moves) >= 3 else 0.0
    return betas, regs, levels, level_sd


def calibration_forecasts(days, gwh, temp, n_paths=4000):
    """Forecast quantiles for the two test windows using only data <= TRAIN_END (deterministic given SEED)."""
    betas, regs, levels, level_sd = fit_inputs(days, gwh, temp, TRAIN_END)
    seasons = [y for y in weather_years(days, 11, 181) if dt.date(y + 1, 5, 7) <= TRAIN_END]
    out = []
    for w, (a, b) in enumerate(TEST_WINDOWS):
        cal = date_range(a, b)
        temps = season_temps(days, temp, seasons, len(cal))
        sim = simulate(np.random.default_rng(SEED + w), cal, seasons, temps, betas, regs, levels, n_paths, level_sd)
        for z in ZONES:
            keys, m = monthly(cal, sim[z])
            out.append({"zone": z, "months": keys, "q": np.percentile(m, QK, axis=0)})
    return out, seasons


def backtest_winters(days):
    """Every Nov-Apr since 2019-20 (a year of residuals before it) whose actuals are complete."""
    return [w for w in range(2019, days[-1].year) if dt.date(w + 1, 4, 30) <= days[-1]]


def backtest(days, gwh, temp, n_paths=2000):
    """Rolling origin: refit on data <= Oct 31 before each winter, forecast its Nov-Apr, score months and totals."""
    fc, totals = [], []
    for w in backtest_winters(days):
        end = dt.date(w, 10, 31)
        betas, regs, levels, level_sd = fit_inputs(days, gwh, temp, end)
        cal = date_range(dt.date(w, 11, 1), dt.date(w + 1, 4, 30))
        seasons = weather_years(days[days <= end], 11, len(cal))
        temps = season_temps(days, temp, seasons, len(cal))
        sim = simulate(np.random.default_rng(SEED + w), cal, seasons, temps, betas, regs, levels, n_paths, level_sd)
        for z in ZONES:
            keys, m = monthly(cal, sim[z])
            fc.append({"zone": z, "months": keys, "q": np.percentile(m, QK, axis=0)})
            q = dict(zip(QK, np.percentile(m.sum(axis=1), QK)))
            act = actual_monthly(days, gwh, z, keys).sum()
            totals.append({"winter": w, "zone": z, "errPct": (act / q[50] - 1) * 100, "in80": q[10] <= act <= q[90]})
    calib, _ = score(days, gwh, fc)
    ws = backtest_winters(days)
    return {"winters": f"{ws[0]}-{ws[0] + 1 - 2000:02d} .. {ws[-1]}-{ws[-1] + 1 - 2000:02d}", "nWinters": len(ws),
            **calib, "totalBiasPct": round(float(np.mean([t["errPct"] for t in totals])), 2),
            "totalMaePct": round(float(np.mean([abs(t["errPct"]) for t in totals])), 2),
            "totalCov80": round(float(np.mean([t["in80"] for t in totals])), 4)}


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
    start, end = horizon(days[-1])
    cal = date_range(start, end)
    years = weather_years(days, start.month, len(cal))
    betas, regs, levels, level_sd = fit_inputs(days, gwh, temp, days[-1])
    temps = season_temps(days, temp, years, len(cal), start.month)
    sim = simulate(np.random.default_rng(SEED), cal, years, temps, betas, regs, levels, N_PATHS, level_sd)
    last_obs = date_range(add_month(start, -12), add_month(end, -12 + 1) - dt.timedelta(1))   # same months, a year earlier
    areas, ma_paths, ma_last = [], 0, 0
    for z in ZONES + ["MA"]:
        if z == "MA":
            paths, last = ma_paths, ma_last
        else:
            keys, paths = monthly(cal, sim[z])
            _, last = monthly(last_obs, gwh[z][[d in set(last_obs) for d in days]][None, :])
            last = last[0]
            ma_paths, ma_last = ma_paths + paths, ma_last + last
        months = [{"ym": f"{y}-{m:02d}", **q} for (y, m), q in zip(keys, quantiles(paths))]
        areas.append({"area": z, "unit": "GWh", "months": months, "total": quantiles(paths.sum(axis=1)[:, None])[0],
                      "samplePaths": [[round(float(v), 3) for v in row] for row in paths[:20]],
                      "sameMonthsLastObservedGWh": [round(float(v), 3) for v in last]})
    fc, cal_seasons = calibration_forecasts(days, gwh, temp)
    calib, rows = score(days, gwh, fc)
    bt = backtest(days, gwh, temp)
    doc = {
        "asOf": dt.date.today().isoformat(),
        "horizon": [f"{y}-{m:02d}" for y, m in keys],
        "nPaths": N_PATHS, "seed": SEED,
        "method": (f"weather bootstrap (the same months of {years[0]}..{years[-1]}, +/-7 days) x rolling 2-year weather "
                   f"model fit to {days[-1]} x 3-state HMM regime-switching residual (tied sd)"),
        "levelAdjustment": {"source": "none: observed load", "ratio": 1.0},
        "recentLevel": {z: round(levels[z], 4) for z in ZONES},
        "levelSdPct": {z: round(level_sd[z], 3) for z in ZONES},
        "areas": areas,
        "calibration": {"trainEnd": TRAIN_END.isoformat(), "test": "2021-11..2022-04 and 2022-11..2023-04",
                        **calib},
        "backtest": bt,
        "notes": [
            f"Regional load of all customer classes, observed daily through {days[-1]} (ISO-NE 2017-2023, then EIA-930). "
            f"The horizon is the {N_MONTHS} full months after the last observed day and moves forward as data arrives.",
            f"sameMonthsLastObservedGWh = the load actually observed in the same months a year earlier "
            f"({last_obs[0]:%Y-%m} .. {last_obs[-1]:%Y-%m}).",
            f"Calibration fit only on data <= {TRAIN_END.isoformat()}, weather from seasons {cal_seasons[0]}-{cal_seasons[-1] + 1}.",
            "MA = the three zones summed per path; zone residuals are simulated independently (MA spread may be too narrow).",
            f"recentLevel = 1 + each zone's mean miss of the 2-year weather model over the last {LEVEL_DAYS} days (carries a load "
            f"trend to today); levelSdPct = how far that level has moved over 6 months, drawn once per path. backtest = the same method refit before each winter {bt['winters']}: 80% range held "
            f"{bt['cov80']:.0%} of {bt['nMonths']} zone-months; 6-month total off by {bt['totalMaePct']:.1f}% on average.",
        ],
    }
    with open(build_path("mc_forecast.json"), "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    with open(build_path("mc_calibration_rows.json"), "w") as fh:
        json.dump(rows, fh, indent=1)
    print("horizon", doc["horizon"][0], "..", doc["horizon"][-1], "| weather years", years, "| levels", doc["recentLevel"],
          "| level sd %", doc["levelSdPct"])
    print("calibration", doc["calibration"])
    print("backtest", bt)
    for a in areas:
        print(a["area"], "6-month total p10/p50/p90:", a["total"]["p10"], a["total"]["p50"], a["total"]["p90"],
              "| last observed", round(sum(a["sameMonthsLastObservedGWh"]), 1))
    print("wrote", build_path("mc_forecast.json"))
    return doc


if __name__ == "__main__":
    main()
