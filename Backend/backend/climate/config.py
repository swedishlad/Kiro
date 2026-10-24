"""Climate configuration settings and physical/economic constants."""

from pydantic_settings import BaseSettings, SettingsConfigDict

# Physical & Engineering Constants
GRAMS_PER_METRIC_TON = 1_000_000.0
HOURS_PER_YEAR = 8_760.0
DAYS_PER_YEAR = 365
BATTERY_ROUND_TRIP_EFFICIENCY = 0.90
SOLAR_DEGRADATION_RATE_YR = 0.005
BATTERY_FADE_RATE_YR = 0.02

# Economic & Carbon Accounting Defaults
DEFAULT_SCC_USD_PER_TON = 190.0  # EPA / White House revised Social Cost of Carbon
DEFAULT_DISCOUNT_RATE = 0.03  # 3% real discount rate
DEFAULT_AVOIDED_ELECTRICITY_RATE_USD = 0.28  # Massachusetts average retail rate ($/kWh)
DEFAULT_MC_SEED = 20261024
DEFAULT_MC_PATHS = 10_000
DEFAULT_ANALYSIS_YEARS = 20

# Ornstein-Uhlenbeck Process Calibration for ISO-NE (New England)
DEFAULT_OU_THETA = 0.50  # Mean reversion speed (half-life ~ 1.4 years)
DEFAULT_OU_SIGMA = 50.0  # Daily volatility (g CO2e/kWh)
DEFAULT_ANNUAL_DECARB_RATE = 0.035  # 3.5% annual grid decarbonization trend


class ClimateSettings(BaseSettings):
    """Runtime configuration for Climate Impact Portfolio services."""

    model_config = SettingsConfigDict(env_prefix="FAIRWATT_CLIMATE_", env_file=".env", extra="ignore")

    # External LME / Marginal Operating Emissions Rate API
    lme_api_url: str = "https://api.watttime.org/v3/signal-index"
    lme_api_key: str = ""
    lme_timeout_seconds: float = 3.0
    lme_max_retries: int = 2

    # Internal optimization settings
    highs_time_limit_sec: float = 2.0
    scc_usd_per_ton: float = DEFAULT_SCC_USD_PER_TON
    discount_rate: float = DEFAULT_DISCOUNT_RATE


settings = ClimateSettings()
