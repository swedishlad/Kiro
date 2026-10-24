"""Build data/build/climate_dashboard.json: the Climate tab's household scenarios, straight from the API.

The site is static (no server at runtime), so it cannot call POST /api/climate/dashboard. Instead this script
sends that endpoint one request per household scenario below, in process through the same FastAPI app the server
runs, and commits the answers. Each scenario's `response` is exactly what the endpoint returns for its `request`
(every other input at the API default, listed in `apiDefaults`).

Reproducible: the requests carry no live-data key, so the endpoint uses its regional ISO-NE emissions profile, and
the Monte Carlo runs on the seeded NumPy engine (the C++ engine splits paths by the machine's thread count, so its
draws differ from machine to machine). Only `metadata.compute_ms` changes between runs.

Run from Backend/:  python3 -m backend.climate.build      (about a minute; needs numpy, scipy, fastapi, httpx)
"""

import asyncio
import itertools
import json
import logging
import os

import httpx

from backend.climate import config, mc_decarb
from backend.climate.arbitrage import DEFAULT_TOU_RATES
from backend.climate.lme_client import get_fallback_moer
from backend.climate.rov import DEFAULT_CANDIDATE_ASSETS
from backend.climate.schemas import ClimateDashboardRequest, ClimateDashboardResponse

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "data", "build", "climate_dashboard.json")

ENDPOINT = "/api/climate/dashboard"

# The household inputs the Climate tab lets a visitor pick. 600 kWh a month is about the typical Massachusetts
# account (consumption_stats.json); 750 kWh, 6 kWh of flexible load and a 10 kWh battery are the API defaults.
OPTIONS = {
    "total_monthly_kwh": [300, 600, 750, 1000, 1500],
    "shiftable_load_kwh": [0, 6, 12],
    "max_battery_capacity_kwh": [0, 10],
}
DEFAULT_SCENARIO = {"total_monthly_kwh": 750, "shiftable_load_kwh": 6, "max_battery_capacity_kwh": 10}


def scenario_requests():
    keys = list(OPTIONS)
    return [dict(zip(keys, values)) for values in itertools.product(*(OPTIONS[k] for k in keys))]


def assumptions():
    """The model constants behind the answers, so the page can state them without hard-coding them."""
    peak = max(DEFAULT_TOU_RATES)
    return {
        "region": get_fallback_moer().region,
        "annualGridDecarbRate": config.DEFAULT_ANNUAL_DECARB_RATE,
        "ouTheta": config.DEFAULT_OU_THETA,
        "ouSigmaGPerKwh": config.DEFAULT_OU_SIGMA,
        "discountRate": config.DEFAULT_DISCOUNT_RATE,
        "analysisYears": config.DEFAULT_ANALYSIS_YEARS,
        "batteryRoundTripEfficiency": config.BATTERY_ROUND_TRIP_EFFICIENCY,
        "avoidedElectricityUsdPerKwh": config.DEFAULT_AVOIDED_ELECTRICITY_RATE_USD,
        "touUsdPerKwh": {
            "offPeak": min(DEFAULT_TOU_RATES),
            "peak": peak,
            "peakHours": [h for h, rate in enumerate(DEFAULT_TOU_RATES) if rate == peak],
        },
        "assets": [
            {
                "name": a.name,
                "annualOutputKwh": a.annual_output_kwh,
                "federalTaxCreditPct": a.federal_itc_pct,
                "lifeYears": a.economic_life_years,
            }
            for a in DEFAULT_CANDIDATE_ASSETS
        ],
    }


async def post_all(requests):
    from app import app  # Backend/app.py, the API entrypoint

    logging.getLogger("httpx").setLevel(logging.WARNING)  # one INFO line per request otherwise

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://climate-build") as client:
        out = []
        for body in requests:
            res = await client.post(ENDPOINT, json=body, timeout=None)
            res.raise_for_status()
            out.append(res.json())
        return out


def build():
    mc_decarb.HAS_CPP_MC = False  # seeded NumPy engine: the same numbers on every machine
    requests = scenario_requests()
    responses = asyncio.run(post_all(requests))

    for body, data in zip(requests, responses):
        ClimateDashboardResponse.model_validate(data)
        if data["metadata"]["data_source_mode"] != "regional_iso_ne_fallback":
            raise RuntimeError(
                f"{body}: expected the regional ISO-NE profile, got {data['metadata']['data_source_mode']}"
            )

    api_defaults = ClimateDashboardRequest().model_dump(mode="json")
    for k, v in DEFAULT_SCENARIO.items():
        if api_defaults[k] != v:
            raise RuntimeError(f"DEFAULT_SCENARIO.{k}={v} no longer matches the API default {api_defaults[k]}")

    doc = {
        "endpoint": f"POST {ENDPOINT}",
        "builtBy": "python3 -m backend.climate.build",
        "mcEngine": "numpy",
        "apiDefaults": api_defaults,
        "options": OPTIONS,
        "defaultScenario": DEFAULT_SCENARIO,
        "assumptions": assumptions(),
        "scenarios": [{"request": body, "response": data} for body, data in zip(requests, responses)],
    }
    tmp = OUT + ".new"
    with open(tmp, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    os.replace(tmp, OUT)

    default = next(s["response"] for s in doc["scenarios"] if s["request"] == DEFAULT_SCENARIO)
    print(f"{OUT}: {len(requests)} scenarios, {os.path.getsize(OUT):,} bytes")
    print("default scenario summary:", default["summary"])


if __name__ == "__main__":
    build()
