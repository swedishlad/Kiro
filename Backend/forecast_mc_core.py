#!/usr/bin/env python3
"""Shared forecast core for the Monte Carlo 6-month consumption forecast (FEAT-001).

Pure, import-safe functions only: no file/network I/O runs at import. Every number traces to
data/snapshot/eia_ma_monthly_2026-08.csv (the frozen EIA-861M MA state-total series) per agent-rules.

Model: the point forecast is the seasonal-naive (same-month-last-year) per-customer kWh value, the
verified ~5.95% baseline. Uncertainty is a per-calendar-month bootstrap of log-residuals
e = ln(actual / same-month-last-year-pred), back-transformed as path = baseline * exp(e).
"""
import csv
import os


def _load_series(eia_path):
    """Read the EIA CSV and return (sales_dict, pc_dict, ordered_ym_list).

    sales_dict / pc_dict are keyed by (year, month). pc is the published kwh_per_customer column
    (sales*1000/customers; ground-truth warns raw customer counts are noisy). ordered_ym_list is the
    months in file order (ascending, no gaps per the verified snapshot). Fails closed on missing file.
    """
    if not os.path.isfile(eia_path):
        raise FileNotFoundError(f"EIA snapshot not found: {eia_path}")
    sales = {}
    pc = {}
    order = []
    with open(eia_path, newline="") as fh:
        for row in csv.DictReader(fh):
            ym = (int(row["year"]), int(row["month"]))
            sales[ym] = float(row["sales_mwh"])
            pc[ym] = float(row["kwh_per_customer"])
            order.append(ym)
    if not order:
        raise ValueError(f"EIA snapshot has no data rows: {eia_path}")
    return sales, pc, order


def _mape(series, ym):
    """Mean absolute percentage error of the same-month-last-year prediction over ym.

    Prediction for (y,m) is series[(y-1,m)]; months without a prior-year observation are skipped.
    Returns (mape_percent, n).
    """
    errs = []
    for (y, m) in ym:
        prior = (y - 1, m)
        if prior not in series:
            continue
        actual = series[(y, m)]
        pred = series[prior]
        if actual == 0:
            continue
        errs.append(abs(actual - pred) / actual)
    if not errs:
        raise ValueError("no overlapping year-pairs to compute MAPE")
    return 100.0 * sum(errs) / len(errs), len(errs)


def baseline_mape(sales, pc, ym):
    """Reproduce the verified seasonal-naive baseline: ~5.95% sales, ~6.01% per-customer, n=188."""
    sales_mape, n_sales = _mape(sales, ym)
    pc_mape, n_pc = _mape(pc, ym)
    # Both series share the same year-pairs, so the n must agree; report the per-customer n.
    assert n_sales == n_pc, f"MAPE sample mismatch: sales n={n_sales} pc n={n_pc}"
    return {
        "sales": round(sales_mape, 2),
        "perCustomer": round(pc_mape, 2),
        "n": n_pc,
    }


def log_residuals_by_month(pc, ym):
    """Per-calendar-month log-residuals e = ln(actual / same-month-last-year-pred).

    Returns {1..12: [float, ...]}. A month with no year-pairs maps to an empty list.
    """
    import math

    out = {m: [] for m in range(1, 13)}
    for (y, m) in ym:
        prior = (y - 1, m)
        if prior not in pc:
            continue
        actual = pc[(y, m)]
        pred = pc[prior]
        if actual <= 0 or pred <= 0:
            continue
        out[m].append(math.log(actual / pred))
    return out


def pooled_residuals(residuals_by_month):
    """Flatten the per-calendar-month residuals into one pooled list (the documented fallback)."""
    pooled = []
    for m in range(1, 13):
        pooled.extend(residuals_by_month[m])
    return pooled


def horizon(info_end=(2026, 8), k=6):
    """The k forecast months. info set ends 2026-08; the six months are 2026-11..2027-04.

    The forecast window matches bill-forecast.md: it starts two months after the info set end
    (2026-09 and 2026-10 are the nowcast gap) so month 1 is 2026-11.
    """
    y, m = info_end
    # First forecast month is info_end + 3 (skip the 2-month nowcast gap), matching 2026-08 -> 2026-11.
    start_index = y * 12 + (m - 1) + 3
    out = []
    for i in range(k):
        idx = start_index + i
        out.append((idx // 12, idx % 12 + 1))
    return out


def seasonal_naive_baseline(pc, horizon_months):
    """Same-month-last-year per-customer baseline for each forecast month. Fails closed if missing."""
    out = {}
    for (y, m) in horizon_months:
        prior = (y - 1, m)
        if prior not in pc:
            raise ValueError(f"no prior-year per-customer value for {y}-{m:02d} (need {prior[0]}-{prior[1]:02d})")
        out[(y, m)] = pc[prior]
    return out
