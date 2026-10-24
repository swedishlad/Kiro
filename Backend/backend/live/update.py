#!/usr/bin/env python3
"""The daily refresh in one command: fetch -> verify -> rebuild -> gates. Fails closed.

Usage (backend root):  python3 -m backend.live.update            (--no-fetch: rebuild and gate the files already here)
  1 fetch    backend.live.fetch_grid (EIA-930 load + Open-Meteo temperature -> data/build/grid_daily.csv) and
             backend.live.fetch_eia861m (EIA-861M -> staged data/build/eia_ma_*monthly.csv.new)
  2 verify   G-LIVE (backend.live.verify_live); only then do the staged EIA files replace the build copies
  3 rebuild  backend.regimes.build -> backend.forecast.mc -> backend.towns.build
  4 gates    G-HMM, G-FC (Monte Carlo), G-CITY, schemas (.kiro/hooks/validate_build.py), pytest on tests/backend and
             tests/hmm (tests/climate covers the FastAPI climate service, reads no data/build file, needs its own deps)
  5 status   data/build/live_status.json: what the site shows as "data through ..."
Any failure exits non-zero before the status file is written. .github/workflows/refresh-data.yml runs this every
day, then the frontend tests and build, and commits data/build/ only if all of it passed and new data arrived.
"""
import csv
import datetime as dt
import json
import subprocess
import sys

from backend.common import ROOT, build_path
from backend.live import fetch_eia861m

PY = sys.executable
STEPS = [
    ("rebuild regimes", [PY, "-m", "backend.regimes.build"]),
    ("rebuild Monte Carlo", [PY, "-m", "backend.forecast.mc"]),
    ("rebuild towns", [PY, "-m", "backend.towns.build"]),
    ("gate G-HMM", [PY, "tests/backend/regimes/check_regimes.py"]),
    ("gate G-FC", [PY, "tests/backend/forecast/check_mc.py"]),
    ("gate G-CITY", [PY, "tests/backend/towns/check_towns.py"]),
    ("gate schemas", [PY, ".kiro/hooks/validate_build.py"]),
    ("gate pytest", [PY, "-m", "pytest", "tests/backend", "tests/hmm", "-q"]),   # the suites that read data/build
]


def run(name, cmd):
    print(f"\n== {name}: {' '.join(cmd[1:])}", flush=True)
    if subprocess.run(cmd, cwd=ROOT).returncode:
        sys.exit(f"REFRESH FAILED at '{name}': nothing is published (data/build/live_status.json not written)")


def status(gates):
    days = [r["date"] for r in csv.DictReader(open(build_path("grid_daily.csv"), newline="")) if r["zone"] == "NEMA"]
    eia = list(csv.DictReader(open(build_path("eia_ma_monthly.csv"), newline="")))
    mcdoc = json.load(open(build_path("mc_forecast.json")))
    grid_end, homes_end = days[-1], f"{eia[-1]['year']}-{int(eia[-1]['month']):02d}"
    doc = {
        "builtAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "gridThrough": grid_end,
        "homesThrough": homes_end,
        "forecastHorizon": [mcdoc["horizon"][0], mcdoc["horizon"][-1]],
        "schedule": "daily, GitHub Actions (.github/workflows/refresh-data.yml); a commit only when new data arrives",
        "sources": [
            {"id": "S17", "name": "ISO-NE hourly load by MA load zone (SMD)", "from": "2017-01-01", "to": "2023-12-31"},
            {"id": "S19", "name": "EIA-930 hourly demand by ISO-NE subregion (published ~10 days late)", "from": "2024-01-01",
             "to": grid_end},
            {"id": "S20", "name": "Open-Meteo daily mean temperature, bias-corrected to ISO-NE's zone points", "from": "2024-01-01",
             "to": grid_end},
            {"id": "S15", "name": "EIA-861M monthly retail sales, Massachusetts (published ~2 months late)", "from": "2010-01",
             "to": homes_end},
        ],
        "gates": gates,
    }
    with open(build_path("live_status.json"), "w") as fh:
        json.dump(doc, fh, indent=1)
        fh.write("\n")
    print(f"\nlive_status: grid through {grid_end}, homes through {homes_end}, forecast {doc['forecastHorizon'][0]} .. "
          f"{doc['forecastHorizon'][1]}; gates {', '.join(gates)}: all pass")


def main():
    if "--no-fetch" not in sys.argv:
        run("fetch grid", [PY, "-m", "backend.live.fetch_grid"])
        run("fetch EIA-861M", [PY, "-m", "backend.live.fetch_eia861m"])
    run("gate G-LIVE", [PY, "-m", "backend.live.verify_live"])
    fetch_eia861m.promote()
    for name, cmd in STEPS:
        run(name, cmd)
    status(["G-LIVE"] + [n.split()[-1] for n, _ in STEPS if n.startswith("gate")])
    run("gate schemas (live_status.json)", [PY, ".kiro/hooks/validate_build.py"])


if __name__ == "__main__":
    main()
