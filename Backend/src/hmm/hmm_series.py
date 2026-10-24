"""Load the EIA-861M MA residential monthly consumption series for the HMM.

Pure functions only: read the committed snapshot CSV with the stdlib ``csv`` module,
reusing the column names from ``reference/ingest_usage.py`` (``year``, ``month``,
``kwh_per_customer``). No HMM logic lives here.
"""
from __future__ import annotations

import csv
import os
from typing import List, Tuple

import numpy as np

# Default series: the committed EIA-861M snapshot (200 months, 2010-01 .. 2026-08).
# Resolved relative to the repo root so the function works regardless of the caller's cwd.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_SERIES_PATH = os.path.join(
    _REPO_ROOT, "data", "snapshot", "eia_ma_monthly_2026-08.csv"
)


def load_eia_series(path: str = DEFAULT_SERIES_PATH) -> Tuple[List[dict], np.ndarray]:
    """Load the monthly ``kwh_per_customer`` series, sorted ascending by (year, month).

    Args:
        path: CSV with the ``year``, ``month`` and ``kwh_per_customer`` columns produced
            by ``reference/ingest_usage.py``. Defaults to the committed EIA snapshot.

    Returns:
        A tuple ``(series, values)`` where ``series`` is an ordered list of
        ``{"period": "YYYY-MM", "value": float}`` dicts and ``values`` is a parallel
        1-D ``float64`` numpy array of ``kwh_per_customer`` in input (chronological) order.
    """
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        required = {"year", "month", "kwh_per_customer"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"series file {path} is missing columns {sorted(missing)}")
        rows = [
            (int(r["year"]), int(r["month"]), float(r["kwh_per_customer"]))
            for r in reader
        ]

    rows.sort(key=lambda t: (t[0], t[1]))
    series = [
        {"period": f"{year:04d}-{month:02d}", "value": value}
        for year, month, value in rows
    ]
    values = np.array([value for _, _, value in rows], dtype=np.float64)
    return series, values
