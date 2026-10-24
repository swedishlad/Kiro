// Typed views of the backend's committed artifacts. Every parser here is pure (text or parsed JSON
// in, typed records out) so it runs the same in the browser and under `node --test`.

import { num, parseCsv, req } from "./csv.ts";
import { ym } from "./format.ts";

// ----------------------------------------------------------------------------- EIA-861M

export interface EiaMonth {
  ym: string;
  year: number;
  month: number;
  preliminary: boolean;
  revenueKusd: number;
  salesMwh: number;
  customers: number;
  priceCents: number;
  kwhPerCustomer: number;
}

export function parseEia(text: string): EiaMonth[] {
  return parseCsv(text).map((r) => ({
    ym: ym(req(r.year), req(r.month)),
    year: req(r.year),
    month: req(r.month),
    preliminary: r.status === "Preliminary",
    revenueKusd: req(r.revenue_kusd),
    salesMwh: req(r.sales_mwh),
    customers: req(r.customers),
    priceCents: req(r.price_cents),
    kwhPerCustomer: req(r.kwh_per_customer),
  }));
}

/**
 * kWh per account using a 12-month trailing mean of customers as the denominator — the backend's
 * `typical_account_2025` method. EIA customer counts jump ±3–10% month to month, so this is the
 * steadier per-home figure. Null for the first 11 months (not enough trailing history).
 */
export function kwhPerAccountTrailing(eia: EiaMonth[]): (number | null)[] {
  return eia.map((m, i) => {
    if (i < 11) return null;
    const trailing = eia.slice(i - 11, i + 1).reduce((s, x) => s + x.customers, 0) / 12;
    return (m.salesMwh * 1000) / trailing;
  });
}

export interface EiaTotalMonth {
  ym: string;
  preliminary: boolean;
  revenueKusd: number;
  salesMwh: number;
  customers: number;
  priceCents: number;
}

export function parseEiaTotal(text: string): EiaTotalMonth[] {
  return parseCsv(text).map((r) => ({
    ym: ym(req(r.year), req(r.month)),
    preliminary: r.status === "Preliminary",
    revenueKusd: req(r.total_revenue_kusd),
    salesMwh: req(r.total_sales_mwh),
    customers: req(r.total_customers),
    priceCents: req(r.total_price_cents),
  }));
}

// ----------------------------------------------------------------------------- utilities & rates

export const UTILITY_IDS = ["NG", "EV_EAST", "EV_WEST", "UNITIL"] as const;
export type UtilityId = (typeof UTILITY_IDS)[number];

export interface Utility {
  id: UtilityId;
  name: string;
  detail: string;
  /** column header in the Mass.gov rate sheets */
  column: string;
}

export const UTILITIES: Utility[] = [
  { id: "NG", name: "National Grid", detail: "Massachusetts Electric / Nantucket Electric", column: "NG" },
  { id: "EV_EAST", name: "Eversource East", detail: "formerly NSTAR Electric", column: "NSTAR" },
  { id: "EV_WEST", name: "Eversource West", detail: "formerly Western Massachusetts Electric (WMECo)", column: "WMECo" },
  { id: "UNITIL", name: "Unitil", detail: "Fitchburg Gas & Electric", column: "Unitil" },
];

export const utilityById = (id: UtilityId): Utility => UTILITIES.find((u) => u.id === id)!;

export interface RatePoint {
  ym: string;
  cents: number | null;
}

/** Basic-service monthly (variable-option) residential rates, ascending, per utility. */
export function parseMonthlyRates(text: string): Record<UtilityId, RatePoint[]> {
  const rows = parseCsv(text)
    .map((r) => ({ ym: ym(req(r.year), req(r.month)), r }))
    .sort((a, b) => (a.ym < b.ym ? -1 : 1));
  const out = {} as Record<UtilityId, RatePoint[]>;
  for (const u of UTILITIES) out[u.id] = rows.map(({ ym: m, r }) => ({ ym: m, cents: num(r[u.column]) }));
  return out;
}

export interface FixedRow {
  termEnd: string;
  cents: Record<UtilityId, number | null>;
}

/** Fixed-option rates; each value sits on its term's LAST month (blank = no term ended). */
export function parseFixedRates(text: string): FixedRow[] {
  const out: FixedRow[] = [];
  for (const r of parseCsv(text)) {
    const cents = {} as Record<UtilityId, number | null>;
    for (const u of UTILITIES) cents[u.id] = num(r[u.column]);
    if (Object.values(cents).some((v) => v !== null)) {
      out.push({ termEnd: ym(req(r.term_end_year), req(r.term_end_month)), cents });
    }
  }
  if (out.length === 0) throw new Error("fixed-rate file contained no data rows");
  return out;
}

// ----------------------------------------------------------------------------- towns

export const ZONES = ["NEMA", "SEMA", "WCMA"] as const;
export type Zone = (typeof ZONES)[number];
export type Area = Zone | "MA";

export const ZONE_NAMES: Record<Area, string> = {
  NEMA: "Northeast MA & Boston",
  SEMA: "Southeast MA",
  WCMA: "West & Central MA",
  MA: "Massachusetts (all zones)",
};

export interface Town {
  id: number;
  geoid: string;
  name: string;
  county: string;
  zone: Zone;
  pop2020: number;
  pop2024: number;
}

export function parseTowns(text: string): Town[] {
  return parseCsv(text).map((r) => {
    const zone = r.zone_approx as Zone;
    if (!ZONES.includes(zone)) throw new Error(`unknown zone ${r.zone_approx}`);
    return {
      id: req(r.town_id),
      geoid: r.geoid,
      name: r.name,
      county: r.county,
      zone,
      pop2020: req(r.pop2020),
      pop2024: req(r.pop2024),
    };
  });
}

/**
 * data/build/towns_metrics.json: a dated snapshot (asOf) of each town's MODELED 6-month electricity
 * forecast — each town is its population share of its ISO-NE zone (no public town-level metered data
 * exists). Zones are approximated by county. Not live/real-time.
 */
export interface TownForecast {
  townId: number;
  name: string;
  zone: Zone;
  pop2024: number;
  modeledAnnualMWh: number;
  modeledResidentialMWh: number;
  perCapitaKwh: number;
  regimeColor: GridColor;
  /** 6-month forecast total MWh, Monte Carlo quantiles */
  forecast6mMWh: Quantiles;
  /** the horizon's six P50 monthly totals, MWh */
  forecastMonthlyP50MWh: number[];
  /** P50 6-month total vs the same months a year earlier (observed), % */
  changeVsLastYearPct: number;
}

export interface TownForecastDoc {
  asOf: string;
  method: string;
  zoneMapping: string;
  horizon: string[];
  towns: TownForecast[];
  zoneTotalsMWh: Record<Zone, number>;
  residentialKwhPerPerson: number;
  notes: string[];
}

// ----------------------------------------------------------------------------- RECS 2020

export interface RecsHome {
  id: string;
  kwh: number;
  dollars: number;
  sqft: number;
  yearMadeRange: number;
  fuelHeat: number;
  typeHuq: number;
  members: number;
  weight: number;
}

export function parseRecs(text: string): RecsHome[] {
  return parseCsv(text).map((r) => ({
    id: r.DOEID,
    kwh: req(r.KWH),
    dollars: req(r.DOLLAREL),
    sqft: req(r.TOTSQFT_EN),
    yearMadeRange: req(r.YEARMADERANGE),
    fuelHeat: req(r.FUELHEAT),
    typeHuq: req(r.TYPEHUQ),
    members: req(r.NHSLDMEM),
    weight: req(r.NWEIGHT),
  }));
}

/** RECS 2020 codebook labels for the fields the dashboard filters on. */
export const HOME_TYPES: Record<number, string> = {
  1: "Mobile home",
  2: "Single-family detached",
  3: "Single-family attached",
  4: "Apartment, 2–4 units",
  5: "Apartment, 5+ units",
};

export const HEAT_FUELS: Record<number, string> = {
  1: "Natural gas",
  2: "Propane",
  3: "Fuel oil",
  5: "Electricity",
  7: "Wood or pellets",
};

/** Same boundaries as the backend's `_sqft_bucket`. */
export const SQFT_BUCKETS = ["<1000", "1000-1999", "2000-2999", "3000+"] as const;
export type SqftBucket = (typeof SQFT_BUCKETS)[number];

export function sqftBucket(sqft: number): SqftBucket {
  if (sqft < 1000) return "<1000";
  if (sqft < 2000) return "1000-1999";
  if (sqft < 3000) return "2000-2999";
  return "3000+";
}

export const SQFT_LABELS: Record<SqftBucket, string> = {
  "<1000": "Under 1,000 sq ft",
  "1000-1999": "1,000–1,999 sq ft",
  "2000-2999": "2,000–2,999 sq ft",
  "3000+": "3,000+ sq ft",
};

// ----------------------------------------------------------------------------- JSON artifacts

export interface Band {
  p10: number;
  p50: number;
  p90: number;
}

export interface ConsumptionStats {
  generated: string;
  sources: string[];
  homeLikeYours: {
    population: string;
    annualKwh: Band & { mean: number; n: number; unweightedMean: number; unweightedMedian: number };
    monthlyKwh: (Band & { month: number })[];
    bySqftBucket: Record<SqftBucket, Band>;
    byHeatFuel: Record<"gas" | "oil" | "electricity" | "propane" | "wood", Band>;
  };
  typicalAccount: { population: string; annualKwh: number; monthlyKwh: number[]; note: string };
  seasonalShares: number[];
  seasonalSharesSum: number;
}

export interface SavingsExample {
  label: string;
  utility: UtilityId;
  userRateCents: number;
  months: string[];
  kwhByMonth: number[];
  basicServiceCentsByMonth: number[];
  savedMonthly: number[];
  savedMonthlyDisplay: string[];
  savedTotal: number;
  savedTotalDisplay: string;
}

export interface SavingsModel {
  generated: string;
  method: string;
  defaultPeriodMonths: number;
  basicServiceRatesCents: Record<UtilityId, number> & { term: string };
  examples: SavingsExample[];
}

export interface MapConsumption {
  generated: string;
  basis: string;
  modeled: boolean;
  note: string;
  thresholds: { unit: string; greenMax: number; greyMax: number; rule: string };
  towns: { townId: number; name: string | null; census: string | null; annualKwhModel: number; class: string }[];
}

export type RegimeName = "GREEN" | "GREY" | "RED";

export interface HmmRegimes {
  schema_version: string;
  source: string;
  unit: string;
  engine: string;
  seed: number;
  n_states: number;
  converged: boolean;
  log_likelihood: number;
  states: { index: number; regime: RegimeName; mean: number; variance: number; stationary_prob: number }[];
  regime_mapping: Record<RegimeName, number>;
  transition_matrix: number[][];
  stationary_distribution: number[];
  timeline: { period: string; value: number; state: number; regime: RegimeName }[];
}

export type GridColor = "green" | "grey" | "red";

/** regimes.json areas: the three ISO-NE zones and MA (daily), plus MA_RES = homes (monthly, EIA). */
export type RegimeArea = Area | "MA_RES";

export interface RangePoint {
  date: string;
  color: GridColor;
  pRed: number;
  /** consumption vs the historical average of the same period in the previous 5 years, % */
  pctVsAverage: number;
  /** half-width of the historical average range (±1 sd), % */
  bandPct: number;
  /** filtered P(below, within, above), from data up to this point only */
  probs?: number[];
  /** regimes.json v2.5+: the classified value: GWh that day (grid zones) or kWh per account (homes) */
  value?: number;
  /** regimes.json v2.5+: % vs a year earlier (grid: 7-day mean vs the same 7 days 52 weeks before) */
  yoyPct?: number;
}

/** regimes.json v2.3+: the homes series' next 6 months */
export interface RangeForecastPoint {
  date: string;
  probs: number[];
  color: GridColor;
  /** "ar1-gap" = the tested gap model (it beat the long-run odds walk-forward); "long-run-mix" = the long-run odds */
  method: "ar1-gap" | "long-run-mix";
  skillVsLongRunMix: number;
  n: number;
}

export interface GridArea {
  area: RegimeArea;
  unit: "day" | "month";
  states: {
    color: GridColor;
    label: string;
    meanSdFromAverage: number;
    sdWithinState: number;
    expectedDurationDays: number;
    shareOfDays: number;
  }[];
  transition: number[][];
  current: RangePoint & { probs: number[] };
  timeline: RangePoint[];
  monthly: { ym: string; green: number; grey: number; red: number }[];
  outlook: { days: number; probs: number[]; method?: RangeForecastPoint["method"]; skillVsLongRunMix?: number; n?: number }[];
  /** homes (MA_RES) only */
  forecast?: RangeForecastPoint[];
  agreementWithBandRule: number;
}

export interface GridRegimes {
  asOf: string;
  method: string;
  series: string;
  definition: { red: string; grey: string; green: string; range: string };
  areas: GridArea[];
  leakageTest: string;
  notes: string[];
}

export interface Quantiles {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface McForecast {
  asOf: string;
  horizon: string[];
  nPaths: number;
  seed: number;
  method: string;
  levelAdjustment: { source: string; ratio: number };
  areas: {
    area: Area;
    unit: string;
    months: (Quantiles & { ym: string })[];
    total: Quantiles;
    samplePaths: number[][];
    /** the same calendar months a year earlier, as observed (live data) */
    sameMonthsLastObservedGWh: number[];
  }[];
  calibration: { trainEnd: string; test: string; nMonths: number; cov80: number; cov90: number; maeVsNaive: number };
  /** rolling origin: refit before every complete winter since 2019-20 (grows a winter a year) */
  backtest?: {
    winters: string;
    nWinters: number;
    nMonths: number;
    cov80: number;
    cov90: number;
    maeVsNaive: number;
    totalBiasPct: number;
    totalMaePct: number;
    totalCov80: number;
  };
  notes: string[];
}

/** data/build/live_status.json: written by the daily refresh only after every backend gate passed */
export interface LiveStatus {
  builtAt: string;
  gridThrough: string;
  homesThrough: string;
  forecastHorizon: [string, string];
  schedule: string;
  sources: { id: string; name: string; from: string; to: string }[];
  gates: string[];
}

// ----------------------------------------------------------------------------- climate (POST /api/climate/dashboard)

/** The Climate API's request body (Backend/backend/climate/schemas.py · ClimateDashboardRequest). */
export interface ClimateRequest {
  bill_id: string | null;
  total_monthly_kwh: number;
  zip_code: string;
  utility_node: string | null;
  hourly_usage_kwh: number[] | null;
  billing_days: number;
  shiftable_load_kwh: number;
  max_battery_capacity_kwh: number;
  max_grid_draw_kw: number;
  carbon_vs_cost_weight: number;
  scc_usd_per_ton: number;
  num_paths: number;
  mc_seed: number;
}

/** The household inputs the Climate section varies; every other input stays at the API default. */
export type ClimateScenarioKey = Pick<ClimateRequest, "total_monthly_kwh" | "shiftable_load_kwh" | "max_battery_capacity_kwh">;

export const CLIMATE_KEYS: readonly (keyof ClimateScenarioKey)[] = ["total_monthly_kwh", "shiftable_load_kwh", "max_battery_capacity_kwh"];

export interface ClimateMaccItem {
  intervention_name: string;
  abatement_cost_usd_per_ton: number;
  annual_tons_abated: number;
  annual_net_financial_savings_usd: number;
}

export interface ClimateAsset {
  asset_name: string;
  capex_usd: number;
  annual_hardware_deflation_rate: number;
  marginal_abatement_cost_usd_per_ton: number;
  co2_averted_lifetime_tons_median: number;
  co2_averted_lifetime_tons_p05: number;
  co2_averted_lifetime_tons_p95: number;
  delay_cost_metric_tons_per_yr: number;
  recommendation: "INSTALL NOW" | "HOLD & WAIT";
  deferral_analysis: { defer_years: number; net_option_value_usd: number }[];
}

/** The Climate API's response (ClimateDashboardResponse; Backend/contracts/climate_dashboard.schema.json). */
export interface ClimateDashboard {
  summary: {
    current_annual_metric_tons: number;
    lifetime_co2_liability_metric_tons: number;
    best_case_reduction_pct: number;
    social_carbon_damage_yr_usd: number;
    /** annual t CO2e abated per $1,000 of capex, x100 */
    portfolio_carbon_yield_pct: number;
  };
  now_arbitrage: {
    average_grid_intensity_g_co2e_per_kwh: number;
    marginal_peak_intensity_g_co2e_per_kwh: number;
    schedulable_reductions_annual_metric_tons: number;
    hourly_series: { hour: number; baseline_load_kwh: number; optimized_load_kwh: number; emissions_intensity_g_co2e_per_kwh: number }[];
    macc_curve: ClimateMaccItem[];
  };
  later_decisions: {
    /** yearly (not cumulative) t CO2e, years 1..20 */
    fan_chart: { years: number[]; median_tons: number[]; p05_lower_bound_tons: number[]; p95_upper_bound_tons: number[] };
    assets: ClimateAsset[];
  };
  metadata: { data_source_mode: string; mc_paths: number; mc_seed: number; compute_ms: number };
}

/** data/build/climate_dashboard.json (backend/climate/build.py): the endpoint's answer for every scenario. */
export interface ClimateArtifact {
  endpoint: string;
  builtBy: string;
  mcEngine: string;
  apiDefaults: ClimateRequest;
  options: Record<keyof ClimateScenarioKey, number[]>;
  defaultScenario: ClimateScenarioKey;
  assumptions: {
    region: string;
    annualGridDecarbRate: number;
    ouTheta: number;
    ouSigmaGPerKwh: number;
    discountRate: number;
    analysisYears: number;
    batteryRoundTripEfficiency: number;
    avoidedElectricityUsdPerKwh: number;
    touUsdPerKwh: { offPeak: number; peak: number; peakHours: number[] };
    assets: { name: string; annualOutputKwh: number; federalTaxCreditPct: number; lifeYears: number }[];
  };
  scenarios: { request: ClimateScenarioKey; response: ClimateDashboard }[];
}

/** data/build/grid_hourly.json: Massachusetts grid load every hour (EIA-930, three zones), 24 values per day. */
export interface GridHourly {
  area: "MA";
  unit: "MW";
  from: string;
  to: string;
  source: string;
  zones?: string[];
  /** one row per day from `from`, 24 hourly MW values each (DST days filled / averaged to 24) */
  mw: number[][];
  /** that day's Massachusetts temperature, °F */
  tempF: number[];
}
