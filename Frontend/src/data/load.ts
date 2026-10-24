// Bundles the backend's committed artifacts. Small files load eagerly; the big ISO-NE ones
// (daily load, grid regimes, town geometry) are split into lazy chunks — see loadGrid/loadGeo.

import eiaCsv from "@backend/build/eia_ma_monthly.csv?raw";
import eiaTotalCsv from "@backend/build/eia_ma_total_monthly.csv?raw";
import townsCsv from "@backend/build/ma_towns.csv?raw";
import recsCsv from "@backend/build/recs_ma.csv?raw";
import consumptionStatsJson from "@backend/build/consumption_stats.json";
import hmmJson from "@backend/build/hmm_regimes.json";
import savingsModelJson from "@backend/build/savings_model.json";
import fixedRatesCsv from "@backend/snapshot/fixed_residential_cents_2026-07-02.csv?raw";
import monthlyRatesCsv from "@backend/snapshot/monthly_residential_cents_2026-07-02.csv?raw";

import {
  kwhPerAccountTrailing,
  parseDaily,
  parseEia,
  parseEiaTotal,
  parseFixedRates,
  parseMonthlyRates,
  parseRecs,
  parseTowns,
  type ConsumptionStats,
  type GridRegimes,
  type HmmRegimes,
  type MapConsumption,
  type SavingsModel,
  type Zone,
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

/** Regime per month, keyed by YYYY-MM. */
export const hmmByYm = new Map(hmm.timeline.map((t) => [t.period, t]));

/** Population (2024) per ISO-NE load zone — the weights the backend uses for MA temperature. */
export const zonePop2024: Record<Zone, number> = towns.reduce(
  (acc, t) => ((acc[t.zone] += t.pop2024), acc),
  { NEMA: 0, SEMA: 0, WCMA: 0 } as Record<Zone, number>,
);

export async function loadMapConsumption(): Promise<MapConsumption> {
  const mod = await import("@backend/build/map_consumption.json");
  return mod.default as MapConsumption;
}

export interface GridBundle {
  regimes: GridRegimes;
  daily: ReturnType<typeof parseDaily>;
}

let gridPromise: Promise<GridBundle> | null = null;
export function loadGrid(): Promise<GridBundle> {
  gridPromise ??= Promise.all([
    import("@backend/build/regimes.json"),
    import("@backend/build/isone_ma_daily.csv?raw"),
  ]).then(([r, d]) => ({ regimes: r.default as unknown as GridRegimes, daily: parseDaily(d.default) }));
  return gridPromise;
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
