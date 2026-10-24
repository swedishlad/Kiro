// Parity tests: the frontend's ports of backend math must reproduce the committed artifacts.
// Run with `npm test` (node --test; Node 22 strips the TypeScript types itself).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseCsv } from "./csv.ts";
import { addMonths, fmtCompact, moneyDisplay, ymIndex, ymLabel } from "./format.ts";
import {
  kwhPerAccountTrailing,
  parseEia,
  parseFixedRates,
  parseMonthlyRates,
  parseRecs,
  parseTowns,
  sqftBucket,
  type ConsumptionStats,
  type MapConsumption,
  type SavingsModel,
} from "./model.ts";
import { calendarYears, summarize, trailing12 } from "./derive.ts";
import { estimateHome } from "./homes.ts";
import { basicServiceCents, computeSavings, coveredWindow, pySum, termSpans } from "./savings.ts";
import { classify, weightedPercentile, weightedShareAtOrBelow } from "./stats.ts";

const backend = new URL("../../../Backend/data/", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, backend), "utf8");
const json = <T>(p: string) => JSON.parse(read(p)) as T;

const fixed = parseFixedRates(read("snapshot/fixed_residential_cents_2026-07-02.csv"));
const spans = termSpans(fixed);

test("moneyDisplay matches the backend's half-up display strings", () => {
  assert.equal(moneyDisplay(-187.785), "-$187.79");
  assert.equal(moneyDisplay(13.11), "$13.11");
  assert.equal(moneyDisplay(-31.2975), "-$31.30");
  assert.equal(moneyDisplay(0.125), "$0.13");
  assert.equal(moneyDisplay(0.1249), "$0.12");
  assert.equal(moneyDisplay(1234567.005), "$1,234,567.01");
  assert.equal(moneyDisplay(-0.004), "$0.00");
  assert.equal(moneyDisplay(0), "$0.00");
  for (const s of ["-$187.79", "$13.11", "$1,234,567.01"]) assert.match(s, /^-?\$\d{1,3}(,\d{3})*\.\d{2}$/);
});

test("savings calculator reproduces every example in savings_model.json", () => {
  const model = json<SavingsModel>("build/savings_model.json");
  assert.ok(model.examples.length >= 2);
  for (const ex of model.examples) {
    const r = computeSavings(spans, {
      utility: ex.utility,
      userRateCents: ex.userRateCents,
      startYm: ex.months[0],
      kwhByMonth: ex.kwhByMonth,
    });
    assert.deepEqual(r.months, ex.months);
    assert.deepEqual(r.basicServiceCentsByMonth, ex.basicServiceCentsByMonth);
    assert.deepEqual(r.savedMonthly, ex.savedMonthly);
    assert.deepEqual(r.savedMonthlyDisplay, ex.savedMonthlyDisplay);
    assert.equal(r.savedTotal, ex.savedTotal);
    assert.equal(r.savedTotalDisplay, ex.savedTotalDisplay);
  }
});

test("current basic-service term matches savings_model.json for every utility", () => {
  const model = json<SavingsModel>("build/savings_model.json");
  const [first, last] = model.basicServiceRatesCents.term.split("..");
  for (const u of ["NG", "EV_EAST", "EV_WEST", "UNITIL"] as const) {
    for (let k = ymIndex(first); k <= ymIndex(last); k++) {
      const m = addMonths(first, k - ymIndex(first));
      assert.equal(basicServiceCents(spans, u, m), model.basicServiceRatesCents[u], `${u} ${m}`);
    }
    assert.equal(coveredWindow(spans, u).last, last);
  }
});

test("savings fails closed outside any basic-service term", () => {
  assert.throws(() => computeSavings(spans, { utility: "NG", userRateCents: 20, startYm: "2027-01", kwhByMonth: [500, 500] }));
  assert.throws(() => computeSavings(spans, { utility: "NG", userRateCents: -1, startYm: "2026-08", kwhByMonth: [500] }));
});

test("weighted percentiles reproduce consumption_stats.json and map thresholds", () => {
  const recs = parseRecs(read("build/recs_ma.csv"));
  const stats = json<ConsumptionStats>("build/consumption_stats.json");
  const map = json<MapConsumption>("build/map_consumption.json");
  const items = recs.map((h) => ({ value: h.kwh, weight: h.weight }));
  assert.equal(recs.length, stats.homeLikeYours.annualKwh.n);
  assert.equal(weightedPercentile(items, 0.1), stats.homeLikeYours.annualKwh.p10);
  assert.equal(weightedPercentile(items, 0.5), stats.homeLikeYours.annualKwh.p50);
  assert.equal(weightedPercentile(items, 0.9), stats.homeLikeYours.annualKwh.p90);
  assert.equal(weightedPercentile(items, 0.33), map.thresholds.greenMax);
  assert.equal(weightedPercentile(items, 0.66), map.thresholds.greyMax);
  for (const b of ["<1000", "1000-1999", "2000-2999", "3000+"] as const) {
    const sub = recs.filter((h) => sqftBucket(h.sqft) === b).map((h) => ({ value: h.kwh, weight: h.weight }));
    assert.equal(weightedPercentile(sub, 0.5), stats.homeLikeYours.bySqftBucket[b].p50, b);
  }
  const share = weightedShareAtOrBelow(items, stats.homeLikeYours.annualKwh.p50);
  assert.ok(share >= 0.5 && share < 0.52);
});

test("traffic-light classes are inclusive on the upper bound", () => {
  assert.equal(classify(4814.67, 4814.67, 7966.61), "GREEN");
  assert.equal(classify(4814.68, 4814.67, 7966.61), "GREY");
  assert.equal(classify(7966.61, 4814.67, 7966.61), "GREY");
  assert.equal(classify(7966.62, 4814.67, 7966.61), "RED");
});

test("EIA series is complete, ascending and matches the typical-account figures", () => {
  const eia = parseEia(read("build/eia_ma_monthly.csv"));
  assert.equal(eia.length, 200);
  assert.equal(eia[0].ym, "2010-01");
  assert.equal(eia[eia.length - 1].ym, "2026-08");
  eia.forEach((m, i) => i && assert.equal(ymIndex(m.ym) - ymIndex(eia[i - 1].ym), 1));
  const stats = json<ConsumptionStats>("build/consumption_stats.json");
  const perAccount = kwhPerAccountTrailing(eia);
  const y2025 = eia.flatMap((m, i) => (m.year === 2025 ? [Math.round(perAccount[i]!)] : []));
  assert.deepEqual(y2025, stats.typicalAccount.monthlyKwh);
  assert.equal(y2025.reduce((a, b) => a + b, 0), stats.typicalAccount.annualKwh);
});

test("monthly basic-service rates parse into four ascending utility series", () => {
  const rates = parseMonthlyRates(read("snapshot/monthly_residential_cents_2026-07-02.csv"));
  for (const u of ["NG", "EV_EAST", "EV_WEST", "UNITIL"] as const) {
    const s = rates[u];
    assert.equal(s[0].ym, "2005-01");
    assert.equal(s[s.length - 1].ym, "2027-01");
    s.forEach((p, i) => i && assert.equal(ymIndex(p.ym) - ymIndex(s[i - 1].ym), 1));
  }
  assert.equal(rates.EV_EAST.find((p) => p.ym === "2027-01")!.cents, 25.51);
  assert.equal(rates.EV_EAST.find((p) => p.ym === "2006-01")!.cents, null); // NSTAR blank before 2007
});

test("town list has 351 towns with unique ids that join to the map geometry", () => {
  const towns = parseTowns(read("build/ma_towns.csv"));
  assert.equal(towns.length, 351);
  assert.equal(new Set(towns.map((t) => t.id)).size, 351);
  const topo = JSON.parse(readFileSync(new URL("../geo/ma-towns.topo.json", import.meta.url), "utf8"));
  const geoms = (Object.values(topo.objects)[0] as { geometries: { properties: { id: number; geoid: string } }[] }).geometries;
  const byId = new Map(towns.map((t) => [t.id, t]));
  assert.equal(geoms.length, 351);
  for (const g of geoms) assert.equal(byId.get(g.properties.id)?.geoid, g.properties.geoid);
});

test("csv reader fails closed on ragged rows", () => {
  assert.throws(() => parseCsv("a,b\n1,2,3\n"));
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [{ a: "1", b: "2" }]);
});

test("formatting helpers", () => {
  assert.equal(ymLabel("2026-08"), "Aug 2026");
  assert.equal(addMonths("2026-11", 3), "2027-02");
  assert.equal(fmtCompact(20861000), "20.9M");
  assert.equal(fmtCompact(1284), "1,284");
});

test("home estimator matches the backend's bands and relaxes thin combinations", () => {
  const recs = parseRecs(read("build/recs_ma.csv"));
  const stats = json<ConsumptionStats>("build/consumption_stats.json");
  const any = estimateHome(recs, { sqft: "any", type: "any", fuel: "any", members: "any" });
  assert.deepEqual([any.p10, any.p50, any.p90, any.n], [stats.homeLikeYours.annualKwh.p10, stats.homeLikeYours.annualKwh.p50, stats.homeLikeYours.annualKwh.p90, 552]);
  const big = estimateHome(recs, { sqft: "3000+", type: "any", fuel: "any", members: "any" });
  assert.deepEqual([big.p10, big.p50, big.p90], [stats.homeLikeYours.bySqftBucket["3000+"].p10, stats.homeLikeYours.bySqftBucket["3000+"].p50, stats.homeLikeYours.bySqftBucket["3000+"].p90]);
  const oil = estimateHome(recs, { sqft: "any", type: "any", fuel: 3, members: "any" });
  assert.equal(oil.p50, stats.homeLikeYours.byHeatFuel.oil.p50);
  const thin = estimateHome(recs, { sqft: "<1000", type: 1, fuel: 7, members: 5 });
  assert.ok(thin.n >= 20 && thin.relaxed.length > 0);
  assert.deepEqual(thin.used, ["sqft", "type", "fuel", "members"].slice(0, 4 - thin.relaxed.length));
});

test("period aggregates price as revenue / sales", () => {
  const eia = parseEia(read("build/eia_ma_monthly.csv"));
  const years = calendarYears(eia);
  assert.equal(years[0].year, 2010);
  assert.equal(years[years.length - 1].year, 2025); // 2026 is partial
  assert.equal(Number(years[0].priceCents.toFixed(2)), 14.59);
  const ttm = trailing12(eia);
  assert.deepEqual([ttm.from, ttm.to, ttm.months], ["2025-09", "2026-08", 12]);
  const last = eia[eia.length - 1];
  assert.equal(Number(summarize([last]).priceCents.toFixed(2)), last.priceCents);
});

test("pySum is Neumaier-compensated like Python 3.12+ sum()", () => {
  assert.equal(pySum(Array(6).fill(-31.2975)), -187.785);
  assert.equal(pySum([0.1, 0.2, 0.3]), 0.6);
  assert.equal(pySum([]), 0);
});
