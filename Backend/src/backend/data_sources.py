"""Shared, pure data loaders and statistical helpers for the FairWatt backend.

Everything here reads the verified snapshots under ``data/snapshot/`` and returns plain
Python data structures. No function writes to disk, so loaders/helpers can be composed by the
three deliverable builders (stats / savings / map) and later wrapped by an API.

Logic is reused from the tested reference scripts rather than rediscovered:
  * ``weighted_percentile`` generalizes ``reference/verify_usage.py``'s ``wmed`` (sort by value,
    take the point whose cumulative weight crosses ``p * sumW``).
  * ``seasonal_shares`` recomputes the 12 calendar-month shares with the exact method in
    ``verify_usage.py`` (per-year sales share, mean over calendar years 2019-2025).
  * ``typical_account_2025`` reproduces the calendar-2025 kWh-per-account vector.
  * ``load_fixed_rates`` / term-span logic mirror ``reference/ingest_rates.py``'s ``derive_terms``.

Honesty rules (agent-rules #1/#11): no invented numbers; every derived constant traces to the
snapshot or to ``.kiro/steering/ground-truth.md``. Fail closed on malformed input (agent-rule #3).
"""
from __future__ import annotations

import csv
import os
from collections import defaultdict
from typing import Dict, List, Optional, Sequence, Tuple

# Repo root = three levels up from this file (src/backend/data_sources.py -> repo root).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SNAPSHOT = os.path.join(_REPO_ROOT, "data", "snapshot")

RECS_PATH = os.path.join(_SNAPSHOT, "recs_ma_2020.csv")
EIA_PATH = os.path.join(_SNAPSHOT, "eia_ma_monthly_2026-08.csv")
FIXED_RATES_PATH = os.path.join(_SNAPSHOT, "fixed_residential_cents_2026-07-02.csv")

# Column header -> UtilityId, per context.json / ingest_rates.py.
UTIL_IDS = {"NG": "NG", "NSTAR": "EV_EAST", "WMECo": "EV_WEST", "Unitil": "UNITIL"}

# Ground-truth anchor: mean of per-year calendar-month sales shares, 2019-2025 (4-dp).
GROUND_TRUTH_SHARES = [0.0940, 0.0867, 0.0802, 0.0716, 0.0685, 0.0783,
                       0.1044, 0.1044, 0.0851, 0.0708, 0.0701, 0.0857]
# Ground-truth anchor: typical MA account calendar-2025 monthly kWh (sales*1000 / trailing-mean customers).
GROUND_TRUTH_TYPICAL_MONTHLY = [687, 652, 566, 527, 483, 554, 791, 710, 542, 497, 459, 667]
GROUND_TRUTH_TYPICAL_ANNUAL = 7135


# --------------------------------------------------------------------------- loaders

def load_recs(path: str = RECS_PATH) -> List[Dict[str, float]]:
    """Load RECS 2020 MA homes. Returns a list of dict rows with the fields the stats need
    coerced to float. Fails closed if a required column is missing or non-numeric."""
    needed = ("KWH", "TOTSQFT_EN", "YEARMADERANGE", "FUELHEAT", "TYPEHUQ", "NWEIGHT")
    out: List[Dict[str, float]] = []
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in needed if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"RECS file {path} missing columns: {missing}")
        for i, r in enumerate(reader):
            try:
                out.append({
                    "KWH": float(r["KWH"]),
                    "TOTSQFT_EN": float(r["TOTSQFT_EN"]),
                    "YEARMADERANGE": float(r["YEARMADERANGE"]),
                    "FUELHEAT": float(r["FUELHEAT"]),
                    "TYPEHUQ": float(r["TYPEHUQ"]),
                    "NWEIGHT": float(r["NWEIGHT"]),
                })
            except (TypeError, ValueError) as exc:
                raise ValueError(f"RECS row {i} has a non-numeric value: {exc}") from exc
    if not out:
        raise ValueError(f"RECS file {path} contained no data rows")
    return out


def load_eia(path: str = EIA_PATH) -> List[Dict[str, float]]:
    """Load EIA-861M MA monthly rows (year, month, status, sales_mwh, customers, kwh_per_customer).
    Fails closed on missing columns or non-numeric numeric cells."""
    needed = ("year", "month", "status", "sales_mwh", "customers", "kwh_per_customer")
    out: List[Dict[str, float]] = []
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in needed if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"EIA file {path} missing columns: {missing}")
        for i, r in enumerate(reader):
            try:
                out.append({
                    "year": int(r["year"]),
                    "month": int(r["month"]),
                    "status": r["status"],
                    "sales_mwh": float(r["sales_mwh"]),
                    "customers": int(r["customers"]),
                    "kwh_per_customer": float(r["kwh_per_customer"]),
                })
            except (TypeError, ValueError) as exc:
                raise ValueError(f"EIA row {i} has a bad value: {exc}") from exc
    if not out:
        raise ValueError(f"EIA file {path} contained no data rows")
    return out


def _num(v: Optional[str]) -> Optional[float]:
    """Parse a rate cell exactly like ingest_rates.num: blank -> None, else 3-dp float."""
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    try:
        return round(float(s), 3)
    except ValueError as exc:
        raise ValueError(f"non-numeric rate cell: {v!r}") from exc


def load_fixed_rates(path: str = FIXED_RATES_PATH) -> List[Tuple[int, int, Dict[str, Optional[float]]]]:
    """Parse the 22-yr basic-service fixed-rate table.

    Returns a list of ``(term_end_year, term_end_month, {utility_id: cents_or_None})`` tuples in
    file order (newest first). The rate value sits on the term's LAST month; a blank cell means
    no term ended for that utility in that month. Mirrors ingest_rates read_csv semantics.
    """
    cols = ["NG", "NSTAR", "WMECo", "Unitil"]
    out: List[Tuple[int, int, Dict[str, Optional[float]]]] = []
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        needed = ["term_end_year", "term_end_month"] + cols
        missing = [c for c in needed if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"fixed-rate file {path} missing columns: {missing}")
        for i, r in enumerate(reader):
            try:
                y, m = int(r["term_end_year"]), int(r["term_end_month"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"fixed-rate row {i} has a bad year/month: {exc}") from exc
            vals = {UTIL_IDS[c]: _num(r[c]) for c in cols}
            if any(v is not None for v in vals.values()):
                out.append((y, m, vals))
    if not out:
        raise ValueError(f"fixed-rate file {path} contained no data rows")
    return out


# --------------------------------------------------------------------------- helpers

def weighted_percentile(values: Sequence[float], weights: Sequence[float], p: float) -> float:
    """Weighted percentile generalizing verify_usage.py's ``wmed`` (which is p=0.5).

    Sort (value, weight) pairs by value, then return the first value whose cumulative weight
    reaches ``p * sum(weights)``. ``p`` is a fraction in [0, 1]. Fails closed on empty input,
    mismatched lengths, non-positive total weight, or out-of-range ``p``.
    """
    if len(values) != len(weights):
        raise ValueError("values and weights must have the same length")
    if not values:
        raise ValueError("weighted_percentile requires at least one value")
    if not 0.0 <= p <= 1.0:
        raise ValueError(f"p must be in [0, 1], got {p}")
    pairs = sorted(zip(values, weights))
    total = sum(w for _, w in pairs)
    if total <= 0:
        raise ValueError("sum of weights must be positive")
    threshold = total * p
    acc = 0.0
    last = pairs[-1][0]
    for v, w in pairs:
        acc += w
        if acc >= threshold:
            return float(v)
    return float(last)


def seasonal_shares(eia_rows: Optional[List[Dict[str, float]]] = None,
                    years: Sequence[int] = range(2019, 2026)) -> List[float]:
    """Recompute the 12 calendar-month sales shares exactly as verify_usage.py does.

    For each calendar year the monthly share = sales_mwh[m] / sum(sales_mwh over that year);
    the reported share for a month is the mean of those per-year shares across ``years``
    (default 2019-2025). Returned full precision and normalized to sum to exactly 1.0.
    """
    if eia_rows is None:
        eia_rows = load_eia()
    yearly: Dict[int, Dict[int, float]] = defaultdict(dict)
    for r in eia_rows:
        yearly[int(r["year"])][int(r["month"])] = float(r["sales_mwh"])
    years = list(years)
    for y in years:
        if y not in yearly or len(yearly[y]) != 12:
            raise ValueError(f"EIA data missing complete 12 months for year {y}")
    shares = []
    for m in range(1, 13):
        per_year = [yearly[y][m] / sum(yearly[y].values()) for y in years]
        shares.append(sum(per_year) / len(per_year))
    total = sum(shares)
    if total <= 0:
        raise ValueError("seasonal shares summed to a non-positive value")
    return [s / total for s in shares]


def typical_account_2025(eia_rows: Optional[List[Dict[str, float]]] = None,
                         year: int = 2025) -> Tuple[int, List[int]]:
    """Return the calendar-2025 typical MA account: (annual_kwh, 12-month vector).

    Each month's value = sales_mwh * 1000 / (12-month trailing mean of customers ending that
    month), matching ground-truth's method. Returns integer kWh rounded per month and the
    integer annual total (sum of the rounded monthly vector).
    """
    if eia_rows is None:
        eia_rows = load_eia()
    rows = sorted(eia_rows, key=lambda r: (int(r["year"]), int(r["month"])))
    customers = [int(r["customers"]) for r in rows]
    by_ym = {(int(r["year"]), int(r["month"])): (float(r["sales_mwh"]), i)
             for i, r in enumerate(rows)}
    monthly: List[int] = []
    for m in range(1, 13):
        key = (year, m)
        if key not in by_ym:
            raise ValueError(f"EIA data missing {year}-{m:02d} for typical-account vector")
        sales_mwh, idx = by_ym[key]
        if idx < 11:
            raise ValueError(f"not enough trailing months before {year}-{m:02d}")
        trailing = customers[idx - 11:idx + 1]
        mean_customers = sum(trailing) / len(trailing)
        monthly.append(round(sales_mwh * 1000 / mean_customers))
    annual = sum(monthly)
    return annual, monthly
