// The Climate tab reads the Climate API's saved answers (Backend/data/build/climate_dashboard.json, written by
// `python3 -m backend.climate.build`). These tests pin the file to the fields and invariants the tab reads.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { bestDeferral, fetchClimateDashboard, findScenario, hourLabel, movedKwh, tonsPerThousandUsd } from "./climate.ts";
import { CLIMATE_KEYS, type ClimateArtifact, type ClimateScenarioKey } from "./model.ts";

const artifact = JSON.parse(readFileSync(new URL("../../../Backend/data/build/climate_dashboard.json", import.meta.url), "utf8")) as ClimateArtifact;

function* allKeys(a: ClimateArtifact): Generator<ClimateScenarioKey> {
  for (const total_monthly_kwh of a.options.total_monthly_kwh)
    for (const shiftable_load_kwh of a.options.shiftable_load_kwh)
      for (const max_battery_capacity_kwh of a.options.max_battery_capacity_kwh) yield { total_monthly_kwh, shiftable_load_kwh, max_battery_capacity_kwh };
}

test("climate_dashboard.json has one API answer for every scenario the tab offers", () => {
  const combos = [...allKeys(artifact)];
  assert.equal(artifact.scenarios.length, combos.length);
  for (const k of combos) assert.ok(findScenario(artifact, k), JSON.stringify(k));
  // the default selection is the API's default request
  for (const k of CLIMATE_KEYS) assert.equal(artifact.defaultScenario[k], artifact.apiDefaults[k], k);
  assert.ok(findScenario(artifact, artifact.defaultScenario));
  assert.equal(findScenario(artifact, { total_monthly_kwh: 1, shiftable_load_kwh: 0, max_battery_capacity_kwh: 0 }), null);
});

test("every saved answer has the shape the Climate tab reads", () => {
  const finite = (v: number) => Number.isFinite(v);
  for (const { request, response: r } of artifact.scenarios) {
    const id = JSON.stringify(request);
    for (const v of Object.values(r.summary)) assert.ok(finite(v), id);
    assert.ok(r.summary.current_annual_metric_tons > 0, id);
    assert.deepEqual(r.now_arbitrage.hourly_series.map((h) => h.hour), [...Array(24).keys()], id);
    for (const h of r.now_arbitrage.hourly_series) assert.ok(h.baseline_load_kwh >= 0 && h.optimized_load_kwh >= 0 && h.emissions_intensity_g_co2e_per_kwh > 0, id);
    const costs = r.now_arbitrage.macc_curve.map((m) => m.abatement_cost_usd_per_ton);
    assert.ok(costs.length >= 1 && costs.every((c, i) => i === 0 || costs[i - 1] <= c), `${id}: MACC ranked cheapest first`);
    assert.ok(r.now_arbitrage.macc_curve.every((m) => m.annual_tons_abated > 0), id);
    const fan = r.later_decisions.fan_chart;
    assert.equal(fan.years.length, artifact.assumptions.analysisYears, id);
    for (const s of [fan.median_tons, fan.p05_lower_bound_tons, fan.p95_upper_bound_tons]) assert.ok(s.length === fan.years.length && s.every((v) => finite(v) && v >= 0), id);
    assert.deepEqual(r.later_decisions.assets.map((a) => a.asset_name), artifact.assumptions.assets.map((a) => a.name), id);
    for (const a of r.later_decisions.assets) {
      assert.ok(a.recommendation === "INSTALL NOW" || a.recommendation === "HOLD & WAIT", id);
      assert.deepEqual(a.deferral_analysis.map((s) => s.defer_years), [0, 1, 2, 3], id);
      // the API's call: install now exactly when no later year is worth more (what the card's chart highlights)
      const [now, ...later] = a.deferral_analysis.map((s) => s.net_option_value_usd);
      assert.equal(a.recommendation === "INSTALL NOW", now >= Math.max(...later), id);
      assert.equal(bestDeferral(a).defer_years === 0, a.recommendation === "INSTALL NOW", id);
    }
    assert.equal(r.metadata.mc_paths, artifact.apiDefaults.num_paths, id);
    assert.equal(r.metadata.mc_seed, artifact.apiDefaults.mc_seed, id);
    assert.equal(r.metadata.data_source_mode, "regional_iso_ne_fallback", id);
    // nothing to move: no reduction and the two hourly lines coincide
    if (request.shiftable_load_kwh === 0 && request.max_battery_capacity_kwh === 0) {
      assert.equal(r.summary.best_case_reduction_pct, 0, id);
      assert.ok(movedKwh(r) < 1e-9, id);
    } else assert.ok(movedKwh(r) > 0, id);
  }
});

test("emissions scale with the monthly kWh (same hourly shape, same grid)", () => {
  const perKwh = [...allKeys(artifact)].map((k) => findScenario(artifact, k)!.summary.current_annual_metric_tons / k.total_monthly_kwh);
  const lo = Math.min(...perKwh);
  const hi = Math.max(...perKwh);
  assert.ok(hi / lo < 1.01, `${lo} .. ${hi}`); // the API rounds tons to 0.01
});

test("Climate tab helpers", () => {
  assert.deepEqual([0, 3, 12, 13, 23].map(hourLabel), ["12 am", "3 am", "12 pm", "1 pm", "11 pm"]);
  assert.equal(tonsPerThousandUsd(18.62), 0.1862);
  const d = findScenario(artifact, artifact.defaultScenario)!;
  const moved = movedKwh(d);
  const series = d.now_arbitrage.hourly_series;
  const added = series.reduce((s, h) => s + h.optimized_load_kwh, 0) - series.reduce((s, h) => s + h.baseline_load_kwh, 0);
  assert.ok(moved > 0 && moved >= added, `${moved} ${added}`);
});

test("fetchClimateDashboard posts only the household inputs and surfaces the API's error", async () => {
  const realFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  try {
    const answer = artifact.scenarios[0].response;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(answer), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const key = { total_monthly_kwh: 820, shiftable_load_kwh: 6, max_battery_capacity_kwh: 10 };
    assert.deepEqual(await fetchClimateDashboard("http://api.test", { ...key, extra: 1 } as ClimateScenarioKey), answer);
    assert.equal(calls[0].url, "http://api.test/api/climate/dashboard");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), key);

    globalThis.fetch = (async () => new Response(JSON.stringify({ detail: "Upstream grid data provider unavailable" }), { status: 502 })) as typeof fetch;
    await assert.rejects(fetchClimateDashboard("http://api.test", key), /Upstream grid data provider unavailable/);
    globalThis.fetch = (async () => new Response("<html>", { status: 500 })) as typeof fetch;
    await assert.rejects(fetchClimateDashboard("http://api.test", key), /HTTP 500/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
