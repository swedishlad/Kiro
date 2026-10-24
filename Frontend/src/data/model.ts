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
  outlook: { days: number; probs: number[] }[];
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
    /** the same calendar months in the last observed season (2022-23), scaled to today's level */
    sameMonthsLastObservedGWh: number[];
  }[];
  calibration: { trainEnd: string; test: string; nMonths: number; cov80: number; cov90: number; maeVsNaive: number };
  notes: string[];
}
