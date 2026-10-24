"""Build and write the committed per-town map artifact ``data/build/map_consumption.json``.

Composes the Deliverable-3 traffic-light model into the JSON shape documented in
``data/build/.plan/backend-stats-plan.md`` and writes it with a stable layout (sorted keys,
trailing newline) so the committed file does not churn across runs.

The artifact is self-contained: 351 records keyed by ``townId`` and join-ready on a frontend
``towns.json``'s ``id``. If ``data/build/towns.json`` is absent (the sandbox case) ids 1..351 are
synthesized with null name/census. Every record is flagged ``modeled: true`` / ``basis:
"statewide-model"`` -- the per-town level is a transparent statewide RECS model, never measured
town data.

Run directly to (re)generate the artifact::

    python3 src/backend/build_map.py
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

from src.backend.map_consumption import NOTE, build_town_records  # noqa: E402

OUT_PATH = os.path.join(_REPO_ROOT, "data", "build", "map_consumption.json")

RULE = "GREEN <= P33 < GREY <= P66 < RED (weighted terciles of RECS MA annual kWh)"


def build_payload() -> dict:
    """Assemble the map_consumption.json payload from the RECS snapshot. Pure (no file writes)."""
    towns, meta = build_town_records()
    return {
        "generated": datetime.date.today().isoformat(),
        "basis": "statewide-model",
        "modeled": True,
        "note": NOTE,
        "thresholds": {
            "unit": "annual kWh",
            "greenMax": meta["greenMax"],
            "greyMax": meta["greyMax"],
            "rule": RULE,
        },
        "towns": towns,
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
    th = payload["thresholds"]
    towns = payload["towns"]
    classes = {c: sum(1 for t in towns if t["class"] == c) for c in ("GREEN", "GREY", "RED")}
    fallback = all(t["name"] is None for t in towns)
    print(
        f"map_consumption.json: {len(towns)} towns, modeled={payload['modeled']}, "
        f"greenMax={th['greenMax']:.2f} greyMax={th['greyMax']:.2f}, "
        f"classes={classes}, townsFallback={fallback} -> {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
