"""Build and write the committed HMM regime artifact ``data/build/hmm_regimes.json``.

Composes the series loader, the HMM fit and the GREEN/GREY/RED mapping into the JSON object
documented in ``research/backend-hmm.md`` and writes it with a stable, byte-reproducible
layout (sorted keys, fixed float precision, trailing newline) so the committed file does not
churn across runs.

Run directly to (re)generate the artifact::

    python3 -m src.hmm.hmm_build
"""
from __future__ import annotations

import json
import os
from typing import Dict

from .hmm_model import SEED, fit_regimes, map_regimes
from .hmm_series import DEFAULT_SERIES_PATH, load_eia_series

SCHEMA_VERSION = "1.0.0"
SOURCE = (
    "EIA-861M MA residential, data/snapshot/eia_ma_monthly_2026-08.csv, "
    "column kwh_per_customer"
)
UNIT = "kWh per residential customer per month"
FLOAT_DP = 6

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_OUT_PATH = os.path.join(_REPO_ROOT, "data", "build", "hmm_regimes.json")


def _round(value: float) -> float:
    return round(float(value), FLOAT_DP)


def build_payload(series_path: str = DEFAULT_SERIES_PATH) -> Dict:
    """Fit the HMM and assemble the artifact dict (no file I/O).

    Args:
        series_path: path to the EIA monthly CSV to fit on. Defaults to the snapshot.

    Returns:
        The JSON-serialisable artifact dict (see ``research/backend-hmm.md`` for the schema).
    """
    series, values = load_eia_series(series_path)
    mapped = map_regimes(fit_regimes(values))

    means = [_round(m) for m in mapped["means"]]
    variances = [_round(v) for v in mapped["variances"]]
    stationary = [_round(p) for p in mapped["stationary_distribution"]]
    regime_by_state = mapped["regime_by_state"]

    states = [
        {
            "index": idx,
            "regime": regime_by_state[idx],
            "mean": means[idx],
            "variance": variances[idx],
            "stationary_prob": stationary[idx],
        }
        for idx in range(mapped["n_states"])
    ]

    transition_matrix = [
        [_round(p) for p in row] for row in mapped["transition_matrix"]
    ]

    path = mapped["path"]
    timeline = [
        {
            "period": entry["period"],
            "value": _round(entry["value"]),
            "state": int(path[i]),
            "regime": regime_by_state[int(path[i])],
        }
        for i, entry in enumerate(series)
    ]

    return {
        "schema_version": SCHEMA_VERSION,
        "source": SOURCE,
        "unit": UNIT,
        "engine": mapped["engine"],
        "seed": SEED,
        "n_states": mapped["n_states"],
        "converged": bool(mapped["converged"]),
        "log_likelihood": _round(mapped["log_likelihood"]),
        "log_likelihood_trajectory": [_round(v) for v in mapped["log_likelihood_trajectory"]],
        "states": states,
        "regime_mapping": mapped["regime_mapping"],
        "transition_matrix": transition_matrix,
        "stationary_distribution": stationary,
        "timeline": timeline,
    }


def build_artifact(
    out_path: str = DEFAULT_OUT_PATH, series_path: str = DEFAULT_SERIES_PATH
) -> str:
    """Build the artifact and write it to ``out_path`` (creating parent dirs).

    Returns the path written.
    """
    payload = build_payload(series_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return out_path


if __name__ == "__main__":
    written = build_artifact()
    print(f"wrote {written}")
