"""End-to-end integration tests for FastAPI Climate Portfolio endpoints."""

from unittest.mock import MagicMock

import httpx
import pytest

from app import app, upstream_http_error_handler, value_error_handler
from backend.climate.schemas import ClimateDashboardResponse


@pytest.fixture
async def async_client():
    """Create async test client with FastAPI lifespan initialized."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


@pytest.mark.asyncio
async def test_health_endpoints(async_client: httpx.AsyncClient):
    """Verify system and domain health check endpoints return 200 OK."""
    res_sys = await async_client.get("/health")
    assert res_sys.status_code == 200
    assert res_sys.json()["status"] == "ok"

    res_climate = await async_client.get("/api/climate/health")
    assert res_climate.status_code == 200
    assert res_climate.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_post_climate_dashboard_default_payload(async_client: httpx.AsyncClient):
    """Verify POST /api/climate/dashboard succeeds with standard inputs and valid schema."""
    payload = {
        "total_monthly_kwh": 800.0,
        "zip_code": "02138",
        "billing_days": 30,
        "shiftable_load_kwh": 5.0,
        "max_battery_capacity_kwh": 10.0,
        "num_paths": 500,
    }
    response = await async_client.post("/api/climate/dashboard", json=payload)
    assert response.status_code == 200
    data = response.json()

    validated = ClimateDashboardResponse.model_validate(data)
    assert validated.summary.current_annual_metric_tons > 0.0
    assert validated.summary.lifetime_co2_liability_metric_tons > 0.0
    assert len(validated.now_arbitrage.hourly_series) == 24
    assert len(validated.now_arbitrage.macc_curve) >= 1
    assert len(validated.later_decisions.fan_chart.years) == 20
    assert len(validated.later_decisions.assets) >= 2
    assert validated.metadata.compute_ms > 0.0


@pytest.mark.asyncio
async def test_post_climate_dashboard_custom_hourly(async_client: httpx.AsyncClient):
    """Verify endpoint accepts explicit 24-hour profile."""
    custom_profile = [1.0] * 24
    payload = {
        "total_monthly_kwh": 720.0,
        "zip_code": "02138",
        "hourly_usage_kwh": custom_profile,
        "num_paths": 200,
    }
    response = await async_client.post("/api/climate/dashboard", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["now_arbitrage"]["hourly_series"][0]["baseline_load_kwh"] == 1.0


@pytest.mark.asyncio
async def test_post_climate_dashboard_invalid_zip(async_client: httpx.AsyncClient):
    """Verify 422 Unprocessable Entity on invalid 5-digit zip code."""
    payload = {
        "total_monthly_kwh": 750.0,
        "zip_code": "INVALID_ZIP",
    }
    response = await async_client.post("/api/climate/dashboard", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_post_climate_dashboard_invalid_kwh(async_client: httpx.AsyncClient):
    """Verify 422 Unprocessable Entity on non-positive consumption."""
    payload = {
        "total_monthly_kwh": -50.0,
        "zip_code": "02138",
    }
    response = await async_client.post("/api/climate/dashboard", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_post_climate_dashboard_bill_id_not_found(async_client: httpx.AsyncClient):
    """Verify 404 Not Found when non-existent bill_id is provided."""
    payload = {
        "bill_id": "nonexistent-bill-uuid-1234",
        "total_monthly_kwh": 750.0,
        "zip_code": "02138",
    }
    response = await async_client.post("/api/climate/dashboard", json=payload)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_exception_handlers():
    """Directly verify custom exception handlers on app."""
    req = MagicMock()
    req.url.path = "/test"

    resp_val = await value_error_handler(req, ValueError("Custom computation domain error"))
    assert resp_val.status_code == 422

    resp_http = await upstream_http_error_handler(req, httpx.ConnectError("Network unreachable"))
    assert resp_http.status_code == 502


@pytest.mark.asyncio
async def test_app_lifespan():
    """Verify application lifespan initializes and tears down http_client."""
    from app import lifespan

    async with lifespan(app):
        assert hasattr(app.state, "http_client")
        assert not app.state.http_client.is_closed
    assert app.state.http_client.is_closed
