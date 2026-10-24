// Bundles the backend's committed artifacts. Small files load eagerly; the bigger ones (regimes,
// forecast, climate scenarios, town geometry) are split into lazy chunks — see loadGrid/loadClimate/loadGeo.

import eiaCsv from "@backend/build/eia_ma_monthly.csv?raw";
import eiaTotalCsv from "@backend/build/eia_ma_total_monthly.csv?raw";
import townsCsv from "@backend/build/ma_towns.csv?raw";
import recsCsv from "@backend/build/recs_ma.csv?raw";
import consumptionStatsJson from "@backend/build/consumption_stats.json";
import hmmJson from "@backend/build/hmm_regimes.json";
import savingsModelJson from "@backend/build/savings_model.json";
import liveStatusJson from "@backend/build/live_status.json";
import fixedRatesCsv from "@backend/snapshot/fixed_residential_cents_2026-07-02.csv?raw";
import monthlyRatesCsv from "@backend/snapshot/monthly_residential_cents_2026-07-02.csv?raw";

import {
  kwhPerAccountTrailing,
  parseEia,
  parseEiaTotal,
  parseFixedRates,
  parseMonthlyRates,
  parseRecs,
  parseTowns,
  type ClimateArtifact,
  type ConsumptionStats,
  type GridRegimes,
  type HmmRegimes,
  type LiveStatus,
  type MapConsumption,
  type McForecast,
  type SavingsModel,
} from "./model.ts";
import { termSpans } from "./savings.ts";

export const eia = parseEia(eiaCsv);
export const eiaTotal = parseEiaTotal(eiaTotalCsv);
export const perAccount = kwhPerAccountTrailing(eia);
export const monthlyRates = parseMonthlyRates(monthlyRatesCsv);
export const fixedRates = parseFixedRates(fixedRatesCsv);
export const spans = termSpans(fixedRates);
export const towns = parseTowns(townsCsv);
export const recs = parseRecs(recsCsv);
export const consumptionStats = consumptionStatsJson as ConsumptionStats;
export const savingsModel = savingsModelJson as SavingsModel;
export const hmm = hmmJson as HmmRegimes;
/** How fresh the grid / homes data are (the backend refreshes them daily from EIA-930, Open-Meteo and EIA-861M). */
export const liveStatus = liveStatusJson as LiveStatus;

/** Regime per month, keyed by YYYY-MM. */
export const hmmByYm = new Map(hmm.timeline.map((t) => [t.period, t]));

export async function loadMapConsumption(): Promise<MapConsumption> {
  const mod = await import("@backend/build/map_consumption.json");
  return mod.default as MapConsumption;
}

export interface GridBundle {
  regimes: GridRegimes;
  forecast: McForecast;
}

let gridPromise: Promise<GridBundle> | null = null;
export function loadGrid(): Promise<GridBundle> {
  gridPromise ??= Promise.all([import("@backend/build/regimes.json"), import("@backend/build/mc_forecast.json")]).then(([r, f]) => ({
    regimes: r.default as unknown as GridRegimes,
    forecast: f.default as unknown as McForecast,
  }));
  return gridPromise;
}

let climatePromise: Promise<ClimateArtifact> | null = null;
/** The Climate API's answers for every household scenario (backend/climate/build.py). */
export function loadClimate(): Promise<ClimateArtifact> {
  climatePromise ??= import("@backend/build/climate_dashboard.json").then((m) => m.default as unknown as ClimateArtifact);
  return climatePromise;
}

export interface TownTopology {
  type: "Topology";
  objects: Record<string, { type: "GeometryCollection"; geometries: unknown[] }>;
  arcs: number[][][];
  transform?: { scale: [number, number]; translate: [number, number] };
}

let geoPromise: Promise<TownTopology> | null = null;
export function loadGeo(): Promise<TownTopology> {
  geoPromise ??= import("../geo/ma-towns.topo.json").then((m) => m.default as unknown as TownTopology);
  return geoPromise;
}
