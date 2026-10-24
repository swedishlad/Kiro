// FairWatt — shared contracts (backend engine; the friend's UI reads these). Every agent codes against these types.
// Changing anything here is an ORCHESTRATOR decision: bump CONTRACTS_VERSION and contracts/VERSION,
// and log the change in research/CHANGELOG.md. JSON Schemas for the data files live next to this file.

export const CONTRACTS_VERSION = "2.2.0";

// ---------------------------------------------------------------- utilities
export type UtilityId = "NG" | "EV_EAST" | "EV_WEST" | "UNITIL";

export const UTILITIES: Record<UtilityId, { label: string; workbookName: string; workbookColumn: "D" | "E" | "F" | "G" }> = {
  NG:      { label: "National Grid",            workbookName: "National Grid", workbookColumn: "D" },
  EV_EAST: { label: "Eversource (East / NSTAR)", workbookName: "NSTAR",         workbookColumn: "E" },
  EV_WEST: { label: "Eversource (West / WMECo)", workbookName: "WMECo",         workbookColumn: "F" },
  UNITIL:  { label: "Unitil",                   workbookName: "Unitil",        workbookColumn: "G" },
};

/** "YYYY-MM" */
export type YearMonth = string;

// ---------------------------------------------------------------- data/build/rates.json  (owner: data-ingest)
export interface MonthlyPrice { ym: YearMonth; utility: UtilityId; cents: number }       // ¢/kWh, 3 dp

export interface FixedTerm {
  utility: UtilityId;
  start: YearMonth | null;   // null = first term in the file (start unknown)
  end: YearMonth;            // the workbook row the value sits on = LAST month of the term
  months: number | null;     // NOT always 6 — see docs/specs/data-dictionary.md §irregular terms
  cents: number;
}

export interface RatesFile {
  source: { id: "S1"; file: string; retrieved: string /* ISO date */; checksum: string };
  monthly: MonthlyPrice[];   // ascending by ym
  fixedTerms: FixedTerm[];
  current: Record<UtilityId, { termStart: YearMonth | null; termEnd: YearMonth; cents: number }>;
}

// ---------------------------------------------------------------- calculator  (owner: calc-engine)
export interface CompareInput { utility: UtilityId; userCents: number; kwhPerMonth: number }

export interface CompareResult {
  userMonthly: number;      // dollars, unrounded
  defaultMonthly: number;   // dollars, unrounded
  diffMonthly: number;      // user − default; + means the user pays MORE than basic service
  diffAnnual: number;       // diffMonthly × 12, labeled "at today's rates"
  defaultCents: number;
  termStart: YearMonth | null;
  termEnd: YearMonth;
}

export type ValidationIssue =
  | { code: "RATE_OUT_OF_RANGE"; message: string }        // hard: userCents outside [1, 100]
  | { code: "RATE_LOOKS_LIKE_DOLLARS"; suggestion: number } // e.g. 0.17 -> 17
  | { code: "RATE_UNUSUAL"; message: string }             // soft warning: outside [5, 45]
  | { code: "KWH_OUT_OF_RANGE"; message: string }         // hard: outside [1, 5000]
  | { code: "UTILITY_MISSING" }                           // hard: utility not one of UtilityId
  | { code: "DATA_STALE"; termEnd: YearMonth };           // hard + BLOCKS the result: today is after the loaded term

// DATA_STALE in `errors` means the UI shows the "stale data" blocked state (no numbers).
export type CompareOutcome =
  | { ok: true; result: CompareResult; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[] };

// ---------------------------------------------------------------- data/build/towns.json  (owner: geo-map)
export interface Town {
  id: number;      // massgis_town_id 1..351 (join key)
  name: string;    // massgis_name, upper case: "BOSTON"
  census: string;  // census_name, mixed case: "Boston" (use for search + display)
  geoid: string;   // Census county-subdivision GEOID
  cx: number; cy: number;  // centroid in panel coordinates
  d: string;       // SVG path
}
export interface TownsFile { w: 680; h: 420; crs: string; source: string; simplifyIntervalMeters: number; towns: Town[] }

// ---------------------------------------------------------------- data/build/layers/*.json  (owner: human, TC; only if G-LAYER passes)
export interface MapLayerFile<V> {
  layer: "L1_utility" | "L2_aggregation";
  sources: { url: string; retrieved: string; note?: string }[];
  coverage: { towns: number; of: 351 };
  spotCheck: { towns: string[]; secondSource: string; mismatches: number };
  values: Record<string /* town id */, V>;
}
export type L1Value = UtilityId | "MUNICIPAL_LIGHT_PLANT" | "MIXED";
export interface L2Value { hasProgram: boolean; supplier?: string; cents?: number; endsYm?: YearMonth }

// ---------------------------------------------------------------- data/build/forecast.json  (owner: forecaster)
export type ModelId = "M0" | "M1" | "M2";

export interface UtilityForecast {
  current: number;              // ¢/kWh, current fixed rate
  p10: number; p50: number; p90: number;
  model: ModelId;
  skill: "beats-naive" | "no-skill";
}

export interface BacktestRow {
  model: ModelId; utility: UtilityId | "POOLED";
  nTerms: number;
  maeLogChange: number;         // mean |log(pred/actual)|
  cov80: number;                // share of actuals inside [p10, p90]
  pinball: { q10: number; q50: number; q90: number };
  vsNaive: number;              // MAE(model) / MAE(M0); < 1 is better
}

export interface ForecastFile {
  asOf: string;                 // ISO date the forecast was frozen (pre-registration)
  infoSetEnd: YearMonth;        // last month of data the model saw
  target: { termStart: "2027-02"; termEnd: "2027-07" };
  perUtility: Record<UtilityId, UtilityForecast>;
  backtest: BacktestRow[];
  plainEnglish: string;         // 1 paragraph, written by forecaster, checked by verifier
}

// ================================================================ v1.2.0: FairWatt Home (usage estimate + bill forecast)
// Spec: docs/specs/estimator.md, docs/specs/bill-forecast.md. Data: S14 (RECS 2020), S15 (EIA-861M).

// ---------------------------------------------------------------- home inputs  (ui-builder collects; calc-engine validates)
/** RECS TYPEHUQ 1..5 */
export type HousingType = "MOBILE" | "SF_DETACHED" | "SF_ATTACHED" | "APT_2_4" | "APT_5_PLUS";
/** RECS FUELHEAT 5, 1, 3, 2, and 7/99 grouped */
export type HeatFuel = "ELECTRIC" | "GAS" | "OIL" | "PROPANE" | "WOOD_OTHER";
/** RECS YEARMADERANGE: 1 = before 1950, 2 = 1950s, … 7 = 2000–2009, 8 = 2010–2015, 9 = 2016–2020 */
export type YearBuiltRange = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface UserMonth { month: number /* 1..12 */; kwh: number }

export interface HomeInput {
  townId: number | null;     // towns.json id; display + (if L1 passed) utility prefill only
  utility: UtilityId;
  sqft: number;              // 200..15000 (RECS TOTSQFT_EN range)
  yearBuilt: YearBuiltRange;
  housing: HousingType;
  heat: HeatFuel;
  userMonths: UserMonth[];   // typed from bills: 0..12 entries, distinct months
  userCents: number | null;  // supply rate from the bill, for F1; null = not entered
}

export interface Band { p10: number; p50: number; p90: number }

// ---------------------------------------------------------------- data/build/estimate_model.json  (owner: calc-engine)
export interface EstimateModelFile {
  asOf: string;                              // ISO date the model was fitted
  sources: { recs: "S14"; eia: "S15" };
  model: "LOGLINEAR" | "CELL_MEDIAN";        // chosen by leave-one-out error (research/estimator.md)
  /** log(annual kWh) = intercept + Σ coef · feature; features defined in docs/specs/estimator.md §3 */
  loglinear?: { intercept: number; coef: { logSqft: number; electricHeat?: number; apartment?: number; yearBuiltRange?: number } };
  /** key = "<sqft bucket>|ELECTRIC or NONELECTRIC|HOUSE or APARTMENT"; "*" = pooled level */
  cells?: { key: string; n: number; medianKwh: number }[];
  residualLog: Band & { n: number };         // leave-one-out residuals log(actual/pred): band = pred × exp(p10..p90)
  looMedianAbsPctError: number;              // e.g. 0.31 = 31%; shown in the drawer
  nHomes: 552;
  shares: number[];                          // 12 values Jan..Dec from S15 sales 2019–2025; sum = 1 ± 0.001
  typical: { year: number; kwhByMonth: number[] };  // S15 typical MA account (12-month-mean customers)
  limits: { sqftMin: 200; sqftMax: 15000; userKwhMin: 50; userKwhMax: 5000 };
}

export type EstimateIssue =
  | { code: "SQFT_OUT_OF_RANGE"; message: string }      // hard: outside [200, 15000]
  | { code: "USER_KWH_OUT_OF_RANGE"; month: number }    // hard: a typed month outside [50, 5000]
  | { code: "DUPLICATE_MONTH"; month: number }          // hard
  | { code: "TOO_FEW_MONTHS"; have: number };           // soft: 1–2 typed months are shown but not used to scale

export interface UsageEstimate {
  label: "ESTIMATED" | "FROM_YOUR_BILLS";    // FROM_YOUR_BILLS once ≥ 3 typed months scale the curve
  annualKwh: Band;
  monthly: { month: number; kwh: Band }[];   // 12 entries Jan..Dec
  typicalMonthly: number[];                  // S15 line for comparison (never mixed into the estimate)
}

export type EstimateOutcome =
  | { ok: true; estimate: UsageEstimate; warnings: EstimateIssue[] }
  | { ok: false; errors: EstimateIssue[] };

// ---------------------------------------------------------------- data/build/usage_forecast.json  (owner: forecaster)
export type UsageModelId = "K0" | "K1";

export interface UsageForecastFile {
  asOf: string;
  infoSetEnd: YearMonth;                     // last S15 month the model saw
  model: UsageModelId;                       // K0 = same month last year; K1 = K0 × trailing trend
  skill: "beats-naive" | "seasonal-only";    // seasonal-only = K0 shipped by the ship rule
  /** Multiplier on a household's same-calendar-month kWh, per calendar month (12 entries). */
  factor: ({ month: number } & Band)[];
  backtest: { model: UsageModelId; nMonths: number; maeLog: number; cov80: number; vsNaive: number }[];
  plainEnglish: string;
}

// ---------------------------------------------------------------- bill forecast  (owner: calc-engine, src/engine/estimate/bill.ts; computed in the browser)
export interface MonthBill {
  ym: YearMonth;
  kwh: Band;
  cents: Band;                               // supply rate; CURRENT_TERM months have p10 = p50 = p90
  dollars: Band;                             // supply portion only
  rateSource: "CURRENT_TERM" | "FORECAST";
}

export interface BillForecast {
  label: UsageEstimate["label"];
  months: MonthBill[];                       // the six calendar months after `today`
  total: Band;
  usageSkill: UsageForecastFile["skill"];
  rateSkill: UtilityForecast["skill"];
}

export interface TrimScenario { pct: number; months: YearMonth[]; savedDollarsP50: number }

// ================================================================ v2.0.0: backend fields for the friend's UI (D1–D6)
// Spec: docs/specs/stats.md, regimes.md, mc-forecast.md, towns.md; contract for the UI: docs/FRONTEND_CONTRACT.md.
// Data: S17 ISO-NE zonal load 2017–2023, S18 Census town population, S15 EIA (level + household), S1 rates.

export type ZoneId = "NEMA" | "SEMA" | "WCMA";
/** "MA" = the three zones summed */
export type AreaId = ZoneId | "MA";
export const AREA_LABELS: Record<AreaId, string> = {
  NEMA: "Northeast Massachusetts & Boston", SEMA: "Southeast Massachusetts", WCMA: "West & Central Massachusetts",
  MA: "Massachusetts (three zones)",
};
/** HMM state colors, ordered by weather-adjusted consumption: green = good (below what weather explains), grey = mid, red = too much */
export type RegimeColor = "green" | "grey" | "red";
export interface Quantiles { p5: number; p10: number; p25: number; p50: number; p75: number; p90: number; p95: number }

// ---------------------------------------------------------------- data/build/stats.json  (owner: stats-engine)  D1, D2 examples
export interface AreaStats {
  area: AreaId;
  label: string;
  years: { from: 2017; to: 2023 };
  annualGWh: { year: number; gwh: number }[];         // calendar years 2017..2023
  meanDailyGWh: number;
  peakDay: { date: string; gwh: number };
  peakHourMW: { date: string; mw: number };
  monthlyProfileGWh: number[];                        // 12 values Jan..Dec: mean GWh per calendar month
  weekendVsWeekdayPct: number;                        // weekend mean ÷ weekday mean − 1
  temperature: { gwhPerHDD: number; gwhPerCDD: number; r2: number };   // daily regression, base 65 °F
  loadFactor: number;                                 // mean hourly MW ÷ peak hourly MW over 2017–2023
  yoyChangePct: number;                               // 2023 vs 2022
  weatherCostGWh2023: number;                         // 2023 load minus the same days at normal (2017–2023 mean) temperatures
}
export interface HouseholdStats {
  typicalAnnualKwh: number;                           // S15 typical MA account, calendar 2025 (7,135)
  typicalMonthlyKwh: number[];                        // 12
  medianBySqft: { bucket: "<1000" | "1000-1999" | "2000-2999" | "3000+"; kwh: number }[];   // RECS weighted
  medianByHeat: { fuel: HeatFuel; kwh: number; n: number }[];
  basicServiceNow: Record<UtilityId, number>;         // ¢/kWh, Aug 2026 – Jan 2027
  allInPrice: { ym: YearMonth; cents: number };       // S15, all-in residential average (supply + delivery)
  savingsExamples: { utility: UtilityId; userCents: number; months: number; kwhPerMonth: number; savedDollars: number }[];  // D2 worked examples from savedVsBasic
}
export interface StatsFile { asOf: string; sources: string[]; areas: AreaStats[]; household: HouseholdStats; notes: string[] }

// ---------------------------------------------------------------- data/build/regimes.json  (owner: regime-model)  D4  (v2.1.0)
// TC's definition: red = above the historical average range, grey = within it, green = below it.
// Range = average ± 1 sd of the same period in the previous 5 years (prior years only: no look-ahead).
/** Zones are daily (ISO-NE, 2020–2023); MA_RES is monthly statewide residential kWh per account (EIA, 2016–2026-08). */
export type RegimeArea = AreaId | "MA_RES";
export interface RegimeState {
  color: RegimeColor;
  label: "good" | "mid" | "too much";
  meanSdFromAverage: -1.5 | 0 | 1.5;                  // anchored: below / within / above the ±1 sd range
  sdWithinState: number;                              // learned (daily) or anchored 0.6 (monthly)
  expectedDurationDays: number;
  shareOfDays: number;                                // share of days (or months) in this state, filtered
}
/** probs = filtered [P(green), P(grey), P(red)] for the stacked probability chart; sums to 1 */
export interface RegimePoint { date: string; color: RegimeColor; pRed: number; probs: [number, number, number]; pctVsAverage: number; bandPct: number }
export interface AreaRegimes {
  area: RegimeArea;
  unit: "day" | "month";
  states: [RegimeState, RegimeState, RegimeState];    // exactly green, grey, red, in that order
  transition: number[][];                             // 3×3 in the same order; rows sum to 1
  current: { date: string; probs: [number, number, number]; color: RegimeColor; pctVsAverage: number; bandPct: number };
  timeline: RegimePoint[];                            // FILTERED states; pctVsAverage = % vs the historical average, bandPct = range half-width %
  monthly: { ym: YearMonth; green: number; grey: number; red: number }[];
  outlook: { days: number; probs: [number, number, number] }[];
  agreementWithBandRule: number;                      // share of points where the HMM colour = the plain above/within/below rule
}
export interface RegimesFile {
  asOf: string;
  method: string;
  series: "consumption vs historical average range (same period, previous 5 years)";
  definition: { red: string; grey: string; green: string; range: string };
  areas: AreaRegimes[];                               // NEMA, SEMA, WCMA, MA, MA_RES
  leakageTest: "pass";
  notes: string[];
}

// ---------------------------------------------------------------- data/build/mc_forecast.json  (owner: forecaster)  D3
export interface McAreaForecast {
  area: AreaId;
  unit: "GWh";
  months: ({ ym: YearMonth } & Quantiles)[];          // 6 months, 2026-11 … 2027-04
  total: Quantiles;                                   // sum over the 6 months, per path
  samplePaths: number[][];                            // 20 paths × 6 months, for a spaghetti chart
  sameMonthsLastObservedGWh: number[];                // the same 6 calendar months, last observed year, level-adjusted
}
export interface McForecastFile {
  asOf: string;
  horizon: YearMonth[];                               // ["2026-11", …, "2027-04"]
  nPaths: number;
  seed: number;
  method: string;                                     // weather-year bootstrap × regression + regime-aware residual bootstrap, level × 1.0435
  levelAdjustment: { source: "S15 all-sector"; ratio: number };
  areas: McAreaForecast[];                            // NEMA, SEMA, WCMA, MA
  calibration: { trainEnd: string; test: string; nMonths: number; cov80: number; cov90: number; maeVsNaive: number };
  notes: string[];
}

// ---------------------------------------------------------------- data/build/towns_metrics.json  (owner: city-model)  D5, D6
export interface TownMetric {
  townId: number;                                     // = towns.json id (join key for the map)
  name: string;
  zone: ZoneId;                                       // approximate by county
  pop2024: number;
  modeledAnnualMWh: number;                           // all classes: population share of its zone × zone load (2023, level-adjusted)
  modeledResidentialMWh: number;                      // population × MA residential kWh per person (S15)
  perCapitaKwh: number;
  regimeColor: RegimeColor;                           // its zone's current HMM state
  forecast6mMWh: Quantiles;                           // zone MC paths × population share
  changeVsLastYearPct: number;                        // forecast p50 vs the same 6 months, last observed year
}
export interface TownsMetricsFile {
  asOf: string;
  method: "modeled: population share of zone";
  zoneMapping: "approximate by county";
  towns: TownMetric[];                                // 351
  zoneTotalsMWh: Record<ZoneId, number>;              // Σ towns in a zone equals the zone value (gate G-CITY)
  notes: string[];
}

// ---------------------------------------------------------------- household fields in the browser  (owner: calc-engine)  D2, D3
export interface SavedVsBasicInput { utility: UtilityId; userCents: number; months: { ym: YearMonth; kwh: number }[] }
export interface SavedVsBasicResult {
  months: { ym: YearMonth; kwh: number; basicCents: number; diffDollars: number }[];   // + = you paid more than basic service
  totalDollars: number;                               // + "you could have saved", − "you saved"
  label: "could-have-saved" | "saved" | "even";
}
export interface SimulatedBills {
  months: ({ ym: YearMonth; rateSource: "CURRENT_TERM" | "FORECAST" } & Quantiles)[];   // dollars per month, supply portion
  total: Quantiles;
  histogram: { edges: number[]; counts: number[] };   // of the 6-month total
  nPaths: number;
  seed: number;
}
