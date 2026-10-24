// Helpers for the Climate section over the Climate API's answers (POST /api/climate/dashboard in
// Backend/app.py). The site is static, so it reads those answers from climate_dashboard.json, one per
// household scenario; with VITE_CLIMATE_API_URL set it can also ask a running API directly.

import { CLIMATE_KEYS, type ClimateArtifact, type ClimateAsset, type ClimateDashboard, type ClimateScenarioKey } from "./model.ts";

export const sameScenario = (a: ClimateScenarioKey, b: ClimateScenarioKey) => CLIMATE_KEYS.every((k) => a[k] === b[k]);

/** The saved answer for these household inputs, or null when the artifact has no such scenario. */
export function findScenario(artifact: ClimateArtifact, key: ClimateScenarioKey): ClimateDashboard | null {
  return artifact.scenarios.find((s) => sameScenario(s.request, key))?.response ?? null;
}

/** 0 -> "12 am", 13 -> "1 pm" */
export function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
}

/** The API's portfolio_carbon_yield_pct is t CO₂e avoided a year per $1,000 of capex, ×100. */
export const tonsPerThousandUsd = (yieldPct: number) => yieldPct / 100;

/** kWh a day the optimizer moves: the sum of the hours where it draws more than the usual pattern. */
export function movedKwh(d: ClimateDashboard): number {
  return d.now_arbitrage.hourly_series.reduce((s, h) => s + Math.max(0, h.optimized_load_kwh - h.baseline_load_kwh), 0);
}

/** The deferral horizon with the highest net option value (the API recommends installing now when it is 0). */
export function bestDeferral(asset: ClimateAsset): ClimateAsset["deferral_analysis"][number] {
  return asset.deferral_analysis.reduce((best, s) => (s.net_option_value_usd > best.net_option_value_usd ? s : best));
}

/** POSTs the household inputs to a running Climate API; every other input stays at the API default. */
export async function fetchClimateDashboard(baseUrl: string, key: ClimateScenarioKey, signal?: AbortSignal): Promise<ClimateDashboard> {
  const res = await fetch(`${baseUrl}/api/climate/dashboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ total_monthly_kwh: key.total_monthly_kwh, shiftable_load_kwh: key.shiftable_load_kwh, max_battery_capacity_kwh: key.max_battery_capacity_kwh }),
    signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* not JSON: keep the status */
    }
    throw new Error(detail);
  }
  return (await res.json()) as ClimateDashboard;
}
