"""FairWatt Backend API entrypoint.

Initializes the FastAPI application, mounts domain routers, manages the async HTTP client
lifespan, and configures exception handlers and CORS middleware.
"""

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.climate.router import router as climate_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("fairwatt")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application resources across startup and shutdown."""
    logger.info("Initializing FairWatt API lifespan resources...")
    app.state.http_client = httpx.AsyncClient(timeout=10.0)
    yield
    logger.info("Closing FairWatt API lifespan resources...")
    await app.state.http_client.aclose()


app = FastAPI(
    title="FairWatt Energy & Climate API",
    description="Quantitative household energy planning, grid decarbonization, and climate portfolio engine.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Map domain calculation ValueErrors to HTTP 422 Unprocessable Entity."""
    logger.warning("Unprocessable entity error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc), "error_type": "ValueError"},
    )


@app.exception_handler(httpx.HTTPError)
async def upstream_http_error_handler(request: Request, exc: httpx.HTTPError):
    """Map upstream HTTP client errors to HTTP 502 Bad Gateway."""
    logger.error("Upstream network error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={"detail": "Upstream grid data provider unavailable", "error": str(exc)},
    )


@app.get("/health", status_code=status.HTTP_200_OK, tags=["System"])
async def health_check():
    """System health check endpoint."""
    return {"status": "ok", "service": "fairwatt-api", "version": "0.1.0"}


app.include_router(climate_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
