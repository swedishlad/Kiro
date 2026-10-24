"""Async client for Locational Marginal Emissions (LME / MOER) data.

Provides hourly marginal operating emissions rate (g CO2e / kWh) for grid nodes.
Supports live API querying with automatic fallback to high-resolution regional
ISO-NE (New England) historical averages when external APIs are unreachable or unconfigured.
"""

import asyncio
import logging
from dataclasses import dataclass

import httpx

from backend.climate.config import settings

logger = logging.getLogger(__name__)

REGIONAL_FALLBACK_PROFILES: dict[str, tuple[float, ...]] = {
    "ISO-NE": (
        280.0,
        265.0,
        255.0,
        250.0,
        255.0,
        275.0,  # 00:00 - 05:00: Clean baseload/wind
        330.0,
        390.0,
        420.0,
        380.0,
        340.0,
        310.0,  # 06:00 - 11:00: Morning ramp
        290.0,
        280.0,
        300.0,
        350.0,
        420.0,
        490.0,  # 12:00 - 17:00: Solar dip -> peak start
        540.0,
        520.0,
        470.0,
        410.0,
        350.0,
        310.0,  # 18:00 - 23:00: Peaker turbines
    ),
    "DEFAULT": (
        290.0,
        270.0,
        260.0,
        255.0,
        260.0,
        280.0,
        340.0,
        400.0,
        425.0,
        385.0,
        345.0,
        315.0,
        295.0,
        285.0,
        305.0,
        355.0,
        425.0,
        495.0,
        535.0,
        515.0,
        465.0,
        405.0,
        350.0,
        315.0,
    ),
}


@dataclass(frozen=True)
class MOERProfile:
    """Marginal Operating Emissions Rate profile across 24 hours."""

    moer_g_co2e_per_kwh: list[float]
    data_source_mode: str
    region: str


def get_fallback_moer(region: str = "ISO-NE") -> MOERProfile:
    """Return deterministic historical baseline profile for the region."""
    curve = REGIONAL_FALLBACK_PROFILES.get(region, REGIONAL_FALLBACK_PROFILES["DEFAULT"])
    return MOERProfile(
        moer_g_co2e_per_kwh=list(curve),
        data_source_mode="regional_iso_ne_fallback",
        region=region,
    )


async def fetch_moer_profile(
    zip_code: str,
    client: httpx.AsyncClient | None = None,
    utility_node: str | None = None,
) -> MOERProfile:
    """Fetch 24-hour MOER profile, attempting live external API with fallback on failure."""
    region = utility_node or "ISO-NE"

    if not settings.lme_api_key or client is None:
        return get_fallback_moer(region)

    headers = {"Authorization": f"Bearer {settings.lme_api_key}"}
    params = {"zip": zip_code}

    for attempt in range(1, settings.lme_max_retries + 2):
        try:
            response = await client.get(
                settings.lme_api_url,
                headers=headers,
                params=params,
                timeout=settings.lme_timeout_seconds,
            )
            if response.status_code == 200:
                data = response.json()
                values = data if isinstance(data, list) else data.get("moer") or data.get("data")
                if isinstance(values, list) and len(values) == 24:
                    return MOERProfile(
                        moer_g_co2e_per_kwh=[float(x) for x in values],
                        data_source_mode="live_lme_api",
                        region=region,
                    )
            logger.warning(
                "LME API returned status %s on attempt %d: %s",
                response.status_code,
                attempt,
                response.text[:100],
            )
        except (httpx.RequestError, httpx.TimeoutException) as exc:
            logger.info("LME API request failed on attempt %d: %s", attempt, exc)

        if attempt <= settings.lme_max_retries:
            await asyncio.sleep(0.05 * (2 ** (attempt - 1)))

    logger.warning("Falling back to regional ISO-NE profile for ZIP %s", zip_code)
    return get_fallback_moer(region)
