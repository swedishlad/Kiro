"""Deliverable 2 - "money you could have saved" vs basic service (supply portion only).

Counterfactual, supply portion only (docs/specs/calculator.md): given a household's actual
monthly kWh and the competitive supply rate they actually paid (cents/kWh), compute what basic
service would have cost over the period and the SIGNED savings::

    userMonthly[m]    = userRateCents     * kWh[m] / 100     # what they paid (supply only)
    defaultMonthly[m] = basicServiceCents * kWh[m] / 100     # what basic service would cost
    savedMonthly[m]   = defaultMonthly[m] - userMonthly[m]   # + = SAVED, - = overpaid (signed)
    savedTotal        = sum(savedMonthly)

Sign convention: positive savings means the user paid LESS than basic service (came out ahead);
negative means they overpaid. This is ``(basic - user) * kWh / 100`` -- calculator.md's
``diffMonthly = (user - basic) * kWh / 100`` with the sign flipped, because the deliverable is
framed as "money you could have saved" (basic-service minus actual).

Internal math is unrounded; ``display`` strings are half-up to cents matching calculator.md's
regex ``^-?\\$\\d{1,3}(,\\d{3})*\\.\\d{2}$``. Honesty rules (agent-rules #1/#11): dollars are the
supply portion only; every rate traces to the verified snapshot. Fail closed on bad input (#3).

Public functions are pure (no file writes) so an API can wrap them later.
"""
from __future__ import annotations

import os
import sys
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, List, Optional, Sequence, Tuple

# Make the repo root importable so ``src.backend`` resolves when run as a script or test.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from src.backend.data_sources import load_fixed_rates  # noqa: E402

UTILITY_IDS = ("NG", "EV_EAST", "EV_WEST", "UNITIL")


# --------------------------------------------------------------------------- term spans

def _add_months(y: int, m: int, k: int) -> Tuple[int, int]:
    """Shift (year, month) by k months, mirroring ingest_rates.add_months."""
    t = y * 12 + (m - 1) + k
    return t // 12, t % 12 + 1


def term_spans(fixed_rows: Optional[List[Tuple[int, int, Dict[str, Optional[float]]]]] = None
               ) -> Dict[str, List[Tuple[Tuple[int, int], Tuple[int, int], float]]]:
    """Derive per-utility basic-service term spans, mirroring ingest_rates.derive_terms.

    The fixed-rate value sits on a term's LAST month; a term starts the month after the previous
    term's end (``previous end + 1 month``). Returns, per utility id, a list of
    ``((start_y, start_m), (end_y, end_m), cents)`` tuples sorted by end date. The first term for
    each utility has no known start, so it is given a start equal to its own end month (it still
    covers that single month); later terms cover previous-end+1 .. this-end inclusive.
    """
    if fixed_rows is None:
        fixed_rows = load_fixed_rates()
    spans: Dict[str, List[Tuple[Tuple[int, int], Tuple[int, int], float]]] = {}
    for util in UTILITY_IDS:
        ends = sorted((y, m, vals[util]) for y, m, vals in fixed_rows if vals.get(util) is not None)
        prev: Optional[Tuple[int, int]] = None
        util_spans: List[Tuple[Tuple[int, int], Tuple[int, int], float]] = []
        for y, m, cents in ends:
            if prev is None:
                start = (y, m)
            else:
                start = _add_months(prev[0], prev[1], 1)
            util_spans.append((start, (y, m), float(cents)))
            prev = (y, m)
        spans[util] = util_spans
    return spans


def basic_service_cents(utility: str, year: int, month: int,
                        spans: Optional[Dict[str, List[Tuple[Tuple[int, int], Tuple[int, int], float]]]] = None
                        ) -> float:
    """Return the basic-service fixed rate (cents/kWh) covering calendar (year, month) for utility.

    A month maps to the fixed rate of the term whose span [start..end] inclusive covers it.
    Fails closed if the utility is unknown or no term covers the requested month.
    """
    if utility not in UTILITY_IDS:
        raise ValueError(f"unknown utility {utility!r}; expected one of {UTILITY_IDS}")
    if spans is None:
        spans = term_spans()
    key = year * 12 + (month - 1)
    for (sy, sm), (ey, em), cents in spans[utility]:
        if sy * 12 + (sm - 1) <= key <= ey * 12 + (em - 1):
            return cents
    raise ValueError(f"no basic-service term covers {utility} {year:04d}-{month:02d}")


# --------------------------------------------------------------------------- display

def _display(amount: float) -> str:
    """Format a signed dollar amount half-up to cents.

    Matches calculator.md's regex ``^-?\\$\\d{1,3}(,\\d{3})*\\.\\d{2}$``: a leading minus only for
    negative values, thousands separators, exactly two decimals. (A positive value prints as
    ``$13.11`` with no leading ``+``, which the regex accepts; the acceptance criteria allow
    either ``+$13.11`` or ``$13.11`` -- we emit the regex-matching ``$13.11``.)
    """
    q = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    negative = q < 0
    whole = abs(q)
    s = f"{whole:,.2f}"
    return f"-${s}" if negative else f"${s}"


# --------------------------------------------------------------------------- savings

def savings(kwh_by_month: Sequence[float], user_rate_cents: float, utility: str,
            start_ym: str, months: int = 6) -> dict:
    """Compute the signed basic-service savings counterfactual (supply portion only).

    Parameters
    ----------
    kwh_by_month : actual monthly kWh for the period (len must equal ``months``).
    user_rate_cents : the competitive supply rate the household paid (cents/kWh).
    utility : one of NG, EV_EAST, EV_WEST, UNITIL.
    start_ym : first calendar month of the window, ``"YYYY-MM"``.
    months : window length (default 6, the user's chosen default period).

    Returns a dict with the month labels, per-month kWh, basic-service rate per month, the
    per-month user/default/saved dollars (unrounded), ``savedTotal`` (unrounded), and half-up
    ``display`` strings. ``savedMonthly`` sign: + = saved vs basic service, - = overpaid.
    Fails closed on a length mismatch, bad month count, or an unparsable ``start_ym``.
    """
    if months <= 0:
        raise ValueError(f"months must be positive, got {months}")
    if len(kwh_by_month) != months:
        raise ValueError(f"kwh_by_month has {len(kwh_by_month)} entries, expected months={months}")
    try:
        sy_s, sm_s = start_ym.split("-")
        sy, sm = int(sy_s), int(sm_s)
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"start_ym must be 'YYYY-MM', got {start_ym!r}") from exc
    if not 1 <= sm <= 12:
        raise ValueError(f"start_ym month out of range: {start_ym!r}")

    spans = term_spans()

    month_labels: List[str] = []
    basic_by_month: List[float] = []
    user_monthly: List[float] = []
    default_monthly: List[float] = []
    saved_monthly: List[float] = []

    for i in range(months):
        y, m = _add_months(sy, sm, i)
        basic = basic_service_cents(utility, y, m, spans)
        kwh = float(kwh_by_month[i])
        um = user_rate_cents * kwh / 100.0
        dm = basic * kwh / 100.0
        month_labels.append(f"{y:04d}-{m:02d}")
        basic_by_month.append(basic)
        user_monthly.append(um)
        default_monthly.append(dm)
        saved_monthly.append(dm - um)

    saved_total = sum(saved_monthly)

    return {
        "utility": utility,
        "userRateCents": user_rate_cents,
        "months": month_labels,
        "kwhByMonth": [float(k) for k in kwh_by_month],
        "basicServiceCentsByMonth": basic_by_month,
        "userMonthly": user_monthly,
        "defaultMonthly": default_monthly,
        "savedMonthly": saved_monthly,
        "savedMonthlyDisplay": [_display(v) for v in saved_monthly],
        "savedTotal": saved_total,
        "savedTotalDisplay": _display(saved_total),
    }
