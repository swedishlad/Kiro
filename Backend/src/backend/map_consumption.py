"""Deliverable 3 - per-town map data + GREEN/GREY/RED traffic-light classification.

Honest-data gap (documented, not invented): there is NO verified per-town consumption source in
the repo. RECS 2020 has no town field, EIA-861M is statewide, and ``docs/apis/06`` lists every
town layer as UNVERIFIED; ``docs/specs/map.md`` says "never color by a number we don't have".
Therefore the per-town value is an explicit statewide RECS MODEL, flagged ``modeled: true`` and
``basis: "statewide-model"`` on every record, never presented as measured town data.

Chosen model (transparent, deterministic): each town carries the same modeled central value --
the NWEIGHT-weighted MA annual-kWh median (state weighted P50). With no per-town characteristic
source we do not fabricate between-town variation. The traffic-light therefore classifies the
STATE distribution bands (weighted terciles of the RECS MA annual-kWh distribution):

    GREEN = good/low   : annual kWh <= weighted P33
    GREY  = mid        : weighted P33 < annual kWh <= weighted P66
    RED   = too much   : annual kWh > weighted P66

The P33/P66 cut values come straight from ``recs_ma_2020.csv`` (NWEIGHT-weighted) and are written
into the artifact's ``thresholds`` block so the frontend and tests share one source of truth.

The 351-town set normally comes from ``data/build/towns.json`` (the map geometry pipeline). That
file needs a network download the sandbox cannot reach, so this module MUST NOT hard-depend on it:
if present it reads real ``id``/``name``/``census``; otherwise it emits town ids 1..351 with
``name``/``census`` null, join-ready on ``townId``. Honesty rules (agent-rules #1/#11) and fail
closed (#3). Public functions are pure (no file writes) so an API can wrap them later.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Dict, List, Optional, Sequence, Tuple

# Make the repo root importable so ``src.backend`` resolves when run as a script or test.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from src.backend.data_sources import load_recs, weighted_percentile  # noqa: E402

TOWNS_PATH = os.path.join(_REPO_ROOT, "data", "build", "towns.json")
TOWN_COUNT = 351

# Weighted-tercile fractions of the RECS MA annual-kWh distribution.
P33 = 0.33
P66 = 0.66

NOTE = (
    "No verified per-town consumption source exists; level is the statewide RECS weighted model. "
    "Classes reflect state distribution bands, not measured town differences."
)


def tercile_cuts(recs_rows: Optional[List[Dict[str, float]]] = None) -> Tuple[float, float]:
    """Return ``(greenMax, greyMax)`` = weighted P33 and P66 of the RECS MA annual-kWh distribution.

    Weighted by ``NWEIGHT`` using the shared ``weighted_percentile`` helper (same convention as
    ``verify_usage.py``'s ``wmed``). Fails closed via that helper on empty/degenerate input.
    """
    if recs_rows is None:
        recs_rows = load_recs()
    kwh = [r["KWH"] for r in recs_rows]
    weights = [r["NWEIGHT"] for r in recs_rows]
    green_max = weighted_percentile(kwh, weights, P33)
    grey_max = weighted_percentile(kwh, weights, P66)
    return green_max, grey_max


def state_model_kwh(recs_rows: Optional[List[Dict[str, float]]] = None) -> float:
    """The shared modeled per-town central value: the NWEIGHT-weighted MA annual-kWh median (P50)."""
    if recs_rows is None:
        recs_rows = load_recs()
    kwh = [r["KWH"] for r in recs_rows]
    weights = [r["NWEIGHT"] for r in recs_rows]
    return weighted_percentile(kwh, weights, 0.5)


def classify(kwh: float, green_max: float, grey_max: float) -> str:
    """Classify an annual-kWh value into GREEN/GREY/RED by the tercile cuts.

    GREEN for ``kwh <= green_max``, GREY for ``green_max < kwh <= grey_max``, RED above. The
    boundary values P33 and P66 fall into GREEN and GREY respectively (inclusive upper bound).
    """
    if kwh <= green_max:
        return "GREEN"
    if kwh <= grey_max:
        return "GREY"
    return "RED"


def _load_towns(path: str = TOWNS_PATH) -> Optional[List[Dict[str, object]]]:
    """Return town id/name/census records from ``towns.json`` if it exists, else ``None``.

    Fails closed only on a file that exists but is malformed; a missing file is the expected
    sandbox case and returns ``None`` so the caller falls back to ids 1..351.
    """
    if not os.path.exists(path):
        return None
    with open(path) as fh:
        data = json.load(fh)
    rows = data["towns"] if isinstance(data, dict) and "towns" in data else data
    if not isinstance(rows, list):
        raise ValueError(f"towns.json at {path} is not a list or {{'towns': [...]}} object")
    out: List[Dict[str, object]] = []
    for r in rows:
        out.append({"id": int(r["id"]), "name": r.get("name"), "census": r.get("census")})
    return out


def build_town_records(recs_rows: Optional[List[Dict[str, float]]] = None,
                       towns: Optional[Sequence[Dict[str, object]]] = None,
                       towns_path: str = TOWNS_PATH) -> Tuple[List[dict], Dict[str, object]]:
    """Build the 351 per-town records plus metadata.

    Returns ``(towns, meta)`` where ``meta`` carries ``greenMax``/``greyMax``, the shared modeled
    ``annualKwhModel``, and a ``townsFallback`` flag (True when ``towns.json`` was absent and ids
    1..351 were synthesized). Pure: reads inputs, writes nothing.
    """
    if recs_rows is None:
        recs_rows = load_recs()
    green_max, grey_max = tercile_cuts(recs_rows)
    model_kwh = state_model_kwh(recs_rows)
    cls = classify(model_kwh, green_max, grey_max)

    if towns is None:
        towns = _load_towns(towns_path)
    fallback = towns is None
    if fallback:
        towns = [{"id": i, "name": None, "census": None} for i in range(1, TOWN_COUNT + 1)]

    records = [
        {
            "townId": int(t["id"]),
            "name": t.get("name"),
            "census": t.get("census"),
            "annualKwhModel": model_kwh,
            "class": cls,
        }
        for t in towns
    ]
    records.sort(key=lambda r: r["townId"])
    meta = {
        "greenMax": green_max,
        "greyMax": grey_max,
        "annualKwhModel": model_kwh,
        "townsFallback": fallback,
    }
    return records, meta
