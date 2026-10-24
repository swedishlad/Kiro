#!/usr/bin/env python3
"""Live household data: refresh MA residential + all-sector monthly sales from EIA-861M (S15).

Downloads https://www.eia.gov/electricity/data/eia861m/xls/sales_revenue.xlsx (keyless, ~2.3 MB; EIA posts a new
month near the end of each month, about two months after it) and rewrites data/build/eia_ma_monthly.csv and
data/build/eia_ma_total_monthly.csv with the same extractor as the snapshot (reference/ingest_usage.py), via
temporary files: the build copies change only after backend.live.verify_live accepts the new ones.
Usage (backend root):  python3 -m backend.live.fetch_eia861m
"""
import importlib.util
import os

from backend.common import ROOT, build_path
from backend.live.fetch_grid import RAW, get

URL = "https://www.eia.gov/electricity/data/eia861m/xls/sales_revenue.xlsx"
OUT = {"eia": "eia_ma_monthly.csv", "eia_total": "eia_ma_total_monthly.csv"}


def ingest_module():
    spec = importlib.util.spec_from_file_location("ingest_usage", os.path.join(ROOT, "reference", "ingest_usage.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def staged(name):
    return build_path(name) + ".new"


def main():
    os.makedirs(RAW, exist_ok=True)
    src = os.path.join(RAW, "sales_revenue.xlsx")
    get(URL, src)
    ing = ingest_module()
    for fn, name in OUT.items():
        getattr(ing, fn)(src, staged(name))
    return [staged(n) for n in OUT.values()]


def promote():
    """Move the verified .new files over the build copies."""
    for name in OUT.values():
        if os.path.exists(staged(name)):
            os.replace(staged(name), build_path(name))


if __name__ == "__main__":
    main()
