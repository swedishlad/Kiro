"""Build and write the committed consumption-statistics artifact ``data/build/consumption_stats.json``.

Composes the data loaders and the Deliverable-1 stats into the JSON shape documented in
``data/build/.plan/backend-stats-plan.md`` and writes it with a stable layout (sorted keys,
trailing newline) so the committed file does not churn across runs.

Run directly to (re)generate the artifact::

    python3 src/backend/build_stats.py
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

from src.backend.data_sources import load_eia, load_recs, seasonal_shares  # noqa: E402
from src.backend.stats_consumption import (  # noqa: E402
    home_like_yours_stats,
    typical_account_stats,
)

OUT_PATH = os.path.join(_REPO_ROOT, "data", "build", "consumption_stats.json")


def build_payload() -> dict:
    """Assemble the consumption_stats.json payload from the snapshots. Pure (no file writes)."""
    recs_rows = load_recs()
    eia_rows = load_eia()
    shares = seasonal_shares(eia_rows)

    home = home_like_yours_stats(recs_rows, shares)
    typical = typical_account_stats(eia_rows)

    return {
        "generated": datetime.date.today().isoformat(),
        "sources": ["S14 RECS 2020 (552 MA homes)", "S15 EIA-861M (200 months)"],
        "homeLikeYours": home,
        "typicalAccount": typical,
        "seasonalShares": shares,
        "seasonalSharesSum": sum(shares),
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
    home = payload["homeLikeYours"]["annualKwh"]
    typical = payload["typicalAccount"]["annualKwh"]
    print(
        f"consumption_stats.json: homeLikeYours p50={home['p50']:.0f} "
        f"(mean={home['mean']:.0f}, n={home['n']}), typicalAccount annual={typical} kWh, "
        f"seasonalShares sum={payload['seasonalSharesSum']:.6f} -> {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
