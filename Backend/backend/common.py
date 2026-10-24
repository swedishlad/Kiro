"""Shared loaders and the daily weather model for the FairWatt backend (regimes, Monte Carlo).

Data: data/build/isone_ma_daily.csv (ISO-NE RT demand by MA load zone, 2017-2023; G-DATA-4) and
data/build/ma_towns.csv (zone population 2024; G-DATA-5). Daily GWh = rt_mwh / 1000.
Area "MA" = the three zones summed per day; its temperature is the zone temperatures weighted by 2024 population.

Weather model (docs/specs/regimes.md §2): GWh ~ 1 + HDD + CDD + weekend + HDD^2/100 + CDD^2/100, base 65 F.
"""
import csv
import datetime as dt
import os

import numpy as np

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ZONES = ["NEMA", "SEMA", "WCMA"]
AREAS = ZONES + ["MA"]
BASE_F = 65.0


def build_path(name):
    return os.path.join(ROOT, "data", "build", name)


def load_daily(path=None):
    """Return (days, gwh, temp): days = np.array of datetime.date; gwh/temp = {zone: np.array}, aligned by day."""
    rows = list(csv.DictReader(open(path or build_path("isone_ma_daily.csv"), newline="")))
    dates = sorted({r["date"] for r in rows})
    idx = {d: i for i, d in enumerate(dates)}
    gwh = {z: np.full(len(dates), np.nan) for z in ZONES}
    temp = {z: np.full(len(dates), np.nan) for z in ZONES}
    for r in rows:
        i = idx[r["date"]]
        gwh[r["zone"]][i] = float(r["rt_mwh"]) / 1000.0
        temp[r["zone"]][i] = float(r["temp_f"])
    for z in ZONES:
        if np.isnan(gwh[z]).any() or np.isnan(temp[z]).any():
            raise ValueError(f"{z}: missing days in the daily file")
    return np.array([dt.date.fromisoformat(d) for d in dates]), gwh, temp


def zone_population(path=None):
    pop = {z: 0 for z in ZONES}
    for r in csv.DictReader(open(path or build_path("ma_towns.csv"), newline="")):
        pop[r["zone_approx"]] += int(r["pop2024"])
    return pop


def with_ma(gwh, temp, pop):
    """Add area 'MA': summed load, population-weighted temperature."""
    w = np.array([pop[z] for z in ZONES], float)
    w /= w.sum()
    gwh = dict(gwh, MA=sum(gwh[z] for z in ZONES))
    temp = dict(temp, MA=sum(w[i] * temp[z] for i, z in enumerate(ZONES)))
    return gwh, temp


def weekend_flags(days):
    return np.array([d.weekday() >= 5 for d in days], float)


def design(temp, weekend):
    """Weather design matrix; works on 1-D (days) or 2-D (paths x days) temperature arrays."""
    hdd = np.maximum(BASE_F - temp, 0.0)
    cdd = np.maximum(temp - BASE_F, 0.0)
    wk = np.broadcast_to(weekend, temp.shape)
    return np.stack([np.ones_like(temp), hdd, cdd, wk, hdd ** 2 / 100.0, cdd ** 2 / 100.0], axis=-1)


def fit_weather(X, y):
    return np.linalg.lstsq(X, y, rcond=None)[0]


def month_starts(days, start):
    """First index of each calendar month from `start` (a date, first of a month) onwards."""
    out, seen = [], set()
    for i, d in enumerate(days):
        key = (d.year, d.month)
        if d >= start and key not in seen:
            seen.add(key)
            out.append(i)
    return out


def month_dummies(days):
    """11 calendar-month indicators (January is the base): daylight and seasonal habits the temperature misses."""
    m = np.array([d.month for d in days])
    return np.stack([(m == k).astype(float) for k in range(2, 13)], axis=-1)


def walk_forward_residuals(days, y, X, start=dt.date(2018, 1, 1), window_days=730, pct=True):
    """Residual of each day from a weather model fit ONLY on the `window_days` before that day's month.

    Rolling (not expanding) so the model tracks the recent level (efficiency, solar, COVID shifts) instead of
    anchoring on 2017. With pct=True the residual is (actual - expected) / expected * 100: errors scale with load,
    so percent keeps winter and summer comparable. Days before `start` are NaN (burn-in). No look-ahead.
    """
    r = np.full(len(y), np.nan)
    starts = month_starts(days, start) + [len(y)]
    for a, b in zip(starts, starts[1:]):
        lo = max(0, a - window_days)
        beta = fit_weather(X[lo:a], y[lo:a])
        exp_ = X[a:b] @ beta
        r[a:b] = (y[a:b] - exp_) / exp_ * 100.0 if pct else y[a:b] - exp_
    return r
