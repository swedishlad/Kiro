"""Build and write the committed savings artifact ``data/build/savings_model.json``.

Composes the Deliverable-2 ``savings`` counterfactual into the JSON shape documented in
``data/build/.plan/backend-stats-plan.md`` and writes it with a stable layout (sorted keys,
trailing newline) so the committed file does not churn across runs. Includes a worked-example
set so the frontend has concrete contract samples (an overpaid NG 22.0c case and a
positive-savings NG 15.0c case).

Run directly to (re)generate the artifact::

    python3 src/backend/build_savings.py
"""
from __future__ import annotations

import datetime
import json
import os
import sys

# Make the repo root importable so ``src.backend`` resolves when run as a script.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from src.backend.savings_model import (  # noqa: E402
    basic_service_cents,
    savings,
    term_spans,
)

OUT_PATH = os.path.join(_REPO_ROOT, "data", "build", "savings_model.json")

DEFAULT_PERIOD_MONTHS = 6
# Forward-looking default window: Aug 2026 - Jan 2027 (the current fixed term).
DEFAULT_START_YM = "2026-08"


def _current_term_rates() -> dict:
    """Basic-service rates covering the default Aug 2026 window, straight from the snapshot."""
    spans = term_spans()
    rates = {u: basic_service_cents(u, 2026, 8, spans) for u in ("NG", "EV_EAST", "EV_WEST", "UNITIL")}
    rates["term"] = "2026-08..2027-01"
    return rates


def _example(label: str, utility: str, user_rate_cents: float, kwh_by_month, start_ym, months):
    """Run ``savings`` and shape one worked example for the artifact."""
    r = savings(kwh_by_month, user_rate_cents, utility, start_ym, months=months)
    return {
        "label": label,
        "utility": r["utility"],
        "userRateCents": r["userRateCents"],
        "months": r["months"],
        "kwhByMonth": r["kwhByMonth"],
        "basicServiceCentsByMonth": r["basicServiceCentsByMonth"],
        "savedMonthly": r["savedMonthly"],
        "savedMonthlyDisplay": r["savedMonthlyDisplay"],
        "savedTotal": r["savedTotal"],
        "savedTotalDisplay": r["savedTotalDisplay"],
    }


def build_payload() -> dict:
    """Assemble the savings_model.json payload. Pure (no file writes)."""
    examples = [
        _example(
            "6 months on NG, paid 22.0c vs basic 17.185c, 650 kWh/mo",
            "NG", 22.0, [650, 650, 650, 650, 650, 650], DEFAULT_START_YM, DEFAULT_PERIOD_MONTHS,
        ),
        _example(
            "1 month on NG, paid 15.0c vs basic 17.185c, 600 kWh (came out ahead)",
            "NG", 15.0, [600], DEFAULT_START_YM, 1,
        ),
    ]
    return {
        "generated": datetime.date.today().isoformat(),
        "method": ("supply-portion-only; saved = (basicService - userRate) * kWh / 100; "
                   "+ = saved, - = overpaid"),
        "defaultPeriodMonths": DEFAULT_PERIOD_MONTHS,
        "basicServiceRatesCents": _current_term_rates(),
        "examples": examples,
    }


def build_artifact(out_path: str = OUT_PATH) -> dict:
    """Build the payload and write it to ``out_path`` (creating parent dirs). Returns the payload."""
    payload = build_payload()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return payload


def main() -> None:
    payload = build_artifact()
    ex0 = payload["examples"][0]
    print(
        f"savings_model.json: {len(payload['examples'])} examples, "
        f"defaultPeriodMonths={payload['defaultPeriodMonths']}, "
        f"example[0] savedTotal={ex0['savedTotal']:.3f} ({ex0['savedTotalDisplay']}) -> {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
