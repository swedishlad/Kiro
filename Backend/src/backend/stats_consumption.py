"""Deliverable 1 statistics: "a home like yours" (RECS 2020) and the typical MA account (EIA-861M).

Two populations are kept strictly separate per ground-truth's rule (never mix RECS and EIA in one
computation): RECS drives the "home like yours" estimate, EIA drives the statewide typical account.

All functions are pure: they take loaded rows (or load the snapshot by default) and return plain
dicts. Every number is derived from the snapshot via data_sources helpers; the 12 monthly bands are
``annual.pX * seasonal_share[m]`` so ``p10 <= p50 <= p90`` holds monthwise by construction.
"""
from __future__ import annotations

import statistics as st
from typing import Dict, List, Optional

from .data_sources import (
    load_eia,
    load_recs,
    seasonal_shares,
    typical_account_2025,
    weighted_percentile,
)

# FUELHEAT code -> label (per ground-truth / RECS codebook).
FUEL_CODES = {"gas": 1, "oil": 3, "electricity": 5, "propane": 2, "wood": 7}


def _sqft_bucket(sqft: float) -> str:
    """Same bucket boundaries as verify_usage.py's ``bucket``."""
    if sqft < 1000:
        return "<1000"
    if sqft < 2000:
        return "1000-1999"
    if sqft < 3000:
        return "2000-2999"
    return "3000+"


def _band(values: List[float], weights: List[float]) -> Dict[str, float]:
    """Weighted P10/P50/P90 band for a set of (value, weight) pairs."""
    return {
        "p10": weighted_percentile(values, weights, 0.10),
        "p50": weighted_percentile(values, weights, 0.50),
        "p90": weighted_percentile(values, weights, 0.90),
    }


def home_like_yours_stats(recs_rows: Optional[List[Dict[str, float]]] = None,
                          shares: Optional[List[float]] = None) -> Dict:
    """RECS 2020 NWEIGHT-weighted "home like yours" statistics.

    Returns the weighted annual mean and weighted P10/P50/P90 band, unweighted median/mean as
    cross-checks, weighted bands by sqft bucket and heating fuel, and a 12-entry monthly band
    built as ``annual.pX * seasonal_share[m]``.
    """
    if recs_rows is None:
        recs_rows = load_recs()
    if shares is None:
        shares = seasonal_shares()

    kwh = [r["KWH"] for r in recs_rows]
    nweight = [r["NWEIGHT"] for r in recs_rows]
    total_w = sum(nweight)

    annual = _band(kwh, nweight)
    weighted_mean = sum(k * w for k, w in zip(kwh, nweight)) / total_w
    annual_block = {
        "mean": weighted_mean,
        "p10": annual["p10"],
        "p50": annual["p50"],
        "p90": annual["p90"],
        "n": len(recs_rows),
        "unweightedMedian": float(st.median(kwh)),
        "unweightedMean": st.mean(kwh),
    }

    # Weighted bands by sqft bucket.
    sq_vals: Dict[str, List[float]] = {}
    sq_wts: Dict[str, List[float]] = {}
    for r in recs_rows:
        b = _sqft_bucket(r["TOTSQFT_EN"])
        sq_vals.setdefault(b, []).append(r["KWH"])
        sq_wts.setdefault(b, []).append(r["NWEIGHT"])
    by_sqft = {b: _band(sq_vals[b], sq_wts[b]) for b in ("<1000", "1000-1999", "2000-2999", "3000+")}

    # Weighted bands by heating fuel.
    fuel_vals: Dict[int, List[float]] = {}
    fuel_wts: Dict[int, List[float]] = {}
    for r in recs_rows:
        code = int(r["FUELHEAT"])
        fuel_vals.setdefault(code, []).append(r["KWH"])
        fuel_wts.setdefault(code, []).append(r["NWEIGHT"])
    by_heat_fuel = {
        label: _band(fuel_vals[code], fuel_wts[code])
        for label, code in FUEL_CODES.items()
    }

    # Monthly bands: annual.pX * seasonal_share[m].
    monthly = []
    for m in range(1, 13):
        share = shares[m - 1]
        monthly.append({
            "month": m,
            "p10": annual["p10"] * share,
            "p50": annual["p50"] * share,
            "p90": annual["p90"] * share,
        })

    return {
        "population": "RECS 2020 MA, NWEIGHT-weighted",
        "annualKwh": annual_block,
        "monthlyKwh": monthly,
        "bySqftBucket": by_sqft,
        "byHeatFuel": by_heat_fuel,
    }


def typical_account_stats(eia_rows: Optional[List[Dict[str, float]]] = None) -> Dict:
    """Statewide typical MA account from EIA-861M (calendar 2025)."""
    if eia_rows is None:
        eia_rows = load_eia()
    annual, monthly = typical_account_2025(eia_rows)
    return {
        "population": "EIA-861M MA residential, calendar 2025 (sales/account)",
        "annualKwh": annual,
        "monthlyKwh": monthly,
        "note": "all residential accounts incl. apartments/seasonal; "
                "shown alongside RECS, never mixed",
    }
