"""Unit tests for LME / MOER client and fallback mechanisms."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from backend.climate.config import settings
from backend.climate.lme_client import (
    REGIONAL_FALLBACK_PROFILES,
    MOERProfile,
    fetch_moer_profile,
    get_fallback_moer,
)


def test_fallback_profile_structure():
    """Verify deterministic fallback profile has 24 valid hours."""
    profile = get_fallback_moer("ISO-NE")
    assert isinstance(profile, MOERProfile)
    assert len(profile.moer_g_co2e_per_kwh) == 24
    assert profile.data_source_mode == "regional_iso_ne_fallback"
    assert profile.region == "ISO-NE"
    for val in profile.moer_g_co2e_per_kwh:
        assert 200.0 <= val <= 650.0


def test_fallback_unknown_region_uses_default():
    """Verify fallback uses DEFAULT profile when region is unknown."""
    profile = get_fallback_moer("UNKNOWN_REGION")
    assert len(profile.moer_g_co2e_per_kwh) == 24
    assert profile.moer_g_co2e_per_kwh == list(REGIONAL_FALLBACK_PROFILES["DEFAULT"])


@pytest.mark.asyncio
async def test_fetch_moer_no_key_returns_fallback():
    """When no API key is provided, client should return fallback without network calls."""
    with patch.object(settings, "lme_api_key", ""):
        profile = await fetch_moer_profile("02138", client=None)
        assert profile.data_source_mode == "regional_iso_ne_fallback"
        assert len(profile.moer_g_co2e_per_kwh) == 24


@pytest.mark.asyncio
async def test_fetch_moer_mocked_success_list():
    """Verify live API returns live_lme_api when external call succeeds with list."""
    mock_data = [300.0 + i * 5 for i in range(24)]
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        status_code=200,
        json=mock_data,
        request=httpx.Request("GET", "https://api.test"),
    )
    mock_client.get.return_value = mock_response

    with patch.object(settings, "lme_api_key", "test_secret_key"):
        profile = await fetch_moer_profile("02138", client=mock_client)
        assert profile.data_source_mode == "live_lme_api"
        assert profile.moer_g_co2e_per_kwh == mock_data


@pytest.mark.asyncio
async def test_fetch_moer_mocked_success_dict():
    """Verify live API returns live_lme_api when external call succeeds with dict format."""
    mock_data = [280.0] * 24
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        status_code=200,
        json={"moer": mock_data},
        request=httpx.Request("GET", "https://api.test"),
    )
    mock_client.get.return_value = mock_response

    with patch.object(settings, "lme_api_key", "test_secret_key"):
        profile = await fetch_moer_profile("02138", client=mock_client)
        assert profile.data_source_mode == "live_lme_api"
        assert profile.moer_g_co2e_per_kwh == mock_data


@pytest.mark.asyncio
async def test_fetch_moer_server_error_falls_back():
    """Verify 500 server error triggers retry and fallback."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        status_code=500,
        text="Internal Server Error",
        request=httpx.Request("GET", "https://api.test"),
    )
    mock_client.get.return_value = mock_response

    with patch.object(settings, "lme_api_key", "test_secret_key"):
        profile = await fetch_moer_profile("02138", client=mock_client)
        assert profile.data_source_mode == "regional_iso_ne_fallback"
        assert len(profile.moer_g_co2e_per_kwh) == 24


@pytest.mark.asyncio
async def test_fetch_moer_timeout_falls_back():
    """Verify timeout triggers fallback gracefully."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = httpx.TimeoutException("Connection timed out")

    with patch.object(settings, "lme_api_key", "test_secret_key"):
        profile = await fetch_moer_profile("02138", client=mock_client)
        assert profile.data_source_mode == "regional_iso_ne_fallback"
        assert len(profile.moer_g_co2e_per_kwh) == 24


@pytest.mark.asyncio
async def test_fetch_moer_malformed_shape_falls_back():
    """Verify unexpected JSON format (wrong length) triggers fallback."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        status_code=200,
        json=[100.0, 200.0],
        request=httpx.Request("GET", "https://api.test"),
    )
    mock_client.get.return_value = mock_response

    with patch.object(settings, "lme_api_key", "test_secret_key"):
        profile = await fetch_moer_profile("02138", client=mock_client)
        assert profile.data_source_mode == "regional_iso_ne_fallback"
        assert len(profile.moer_g_co2e_per_kwh) == 24
