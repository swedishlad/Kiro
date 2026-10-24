// The nowcast panel draws regimes.json as the backend wrote it: these pin the data prep to the live file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { addMonths } from "./format.ts";
import { kwhPerAccountTrailing, parseEia, type GridRegimes } from "./model.ts";
import { STACK, Z_LIM, forecastBars, gridContext, headline, homesContext, monthlyTotals, nextLine, nowPoints, pctPerSd } from "./nowcast.ts";

const read = (p: string) => readFileSync(new URL(`../../../Backend/data/build/${p}`, import.meta.url), "utf8");
const regimes = JSON.parse(read("regimes.json")) as GridRegimes;
const eia = parseEia(read("eia_ma_monthly.csv"));

test("every area's points carry filtered probabilities and sd = % vs average / half-range", () => {
  for (const a of regimes.areas) {
    const pts = nowPoints(a.timeline);
    assert.equal(pts.length, a.timeline.length);
    pts.forEach((p, i) => {
      const t = a.timeline[i];
      assert.ok(t.probs && t.probs.length === 3, `${a.area} ${t.date}: probs missing`);
      assert.ok(Math.abs(p.probs[0] + p.probs[1] + p.probs[2] - 1) < 1e-3, `${a.area} ${t.date}: probs sum`);
      assert.ok(Math.abs(p.sd - t.pctVsAverage / t.bandPct) < 1e-9);
      assert.ok(Math.abs(p.z) <= Z_LIM && (Math.abs(p.sd) > Z_LIM ? Math.abs(p.z) === Z_LIM : p.z === p.sd));
    });
  }
});

test("the headline is the current point's most likely state", () => {
  for (const a of regimes.areas) {
    const h = headline(a);
    assert.equal(h.p, Math.max(...(a.current.probs as number[])));
    assert.equal(h.color, STACK[(a.current.probs as number[]).indexOf(h.p)]);
  }
});

test("homes forecast: 6 months after the last data month, hatched where the model did not beat the long-run odds", () => {
  const homes = regimes.areas.find((a) => a.area === "MA_RES")!;
  const fc = forecastBars(homes);
  const last = homes.timeline[homes.timeline.length - 1].date.slice(0, 7);
  assert.deepEqual(fc.map((f) => f.ym), [1, 2, 3, 4, 5, 6].map((k) => addMonths(last, k)));
  fc.forEach((f, i) => assert.equal(f.model, homes.forecast![i].method === "ar1-gap"));
  const next = nextLine(fc);
  assert.equal(next.model.length + next.longRun, 6);
  for (const a of regimes.areas.filter((x) => x.unit === "day")) assert.deepEqual(forecastBars(a), []);
});

test("pctPerSd is the median half-range", () => {
  assert.equal(pctPerSd([]), 0);
  const t = (b: number) => ({ date: "2020-01-01", color: "grey" as const, pRed: 0, pctVsAverage: 0, bandPct: b });
  assert.equal(pctPerSd([t(3), t(1), t(2)]), 2);
  assert.equal(pctPerSd([t(4), t(1), t(2), t(3)]), 2.5);
});


test("homes panels: kWh per account and its usual range agree with the regime model; sales vs a year earlier", () => {
  const homes = regimes.areas.find((a) => a.area === "MA_RES")!;
  const per = kwhPerAccountTrailing(eia);
  const ctx = homesContext(homes.timeline, eia, per);
  const idx = new Map(eia.map((m, i) => [m.ym, i]));
  homes.timeline.forEach((t, k) => {
    const ym = t.date.slice(0, 7);
    // the site's own average of the same month in the previous 5 years (>= 3) reproduces the backend's average
    const prior = [1, 2, 3, 4, 5].map((y) => idx.get(`${Number(ym.slice(0, 4)) - y}${ym.slice(4)}`)).flatMap((i) => (i === undefined || per[i] === null ? [] : [per[i] as number]));
    assert.ok(prior.length >= 3, `${ym}: fewer than 3 prior years`);
    const mean = prior.reduce((s, v) => s + v, 0) / prior.length;
    assert.ok(Math.abs((ctx.avg[k] as number) / mean - 1) < 1e-3, `${ym}: average ${ctx.avg[k]} vs ${mean}`);
    assert.ok(Math.abs((ctx.value[k] as number) / (t.value as number) - 1) < 1e-5, `${ym}: site kWh vs backend value`);
    assert.ok((ctx.lo[k] as number) < (ctx.avg[k] as number) && (ctx.avg[k] as number) < (ctx.hi[k] as number));
    const i = idx.get(ym)!;
    const prev = idx.get(`${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`)!;
    assert.ok(Math.abs((ctx.yoy[k] as number) - (eia[i].salesMwh / eia[prev].salesMwh - 1)) < 1e-12);
  });
  // the model smooths short excursions, so the colour follows the plain above / within / below rule most of the time
  const above = homes.timeline.filter((_, k) => (ctx.value[k] as number) > (ctx.hi[k] as number));
  assert.ok(above.filter((t) => t.color === "red").length / above.length > 0.6, "months above the band are mostly red");
});

test("grid panels and the fan's history come from the backend's own daily values", () => {
  const ma = regimes.areas.find((a) => a.area === "MA")!;
  const ctx = gridContext(ma.timeline);
  ma.timeline.forEach((t, k) => {
    assert.ok(typeof t.value === "number" && t.value > 0, `${t.date}: value`);
    assert.ok(Math.abs((ctx.avg[k] as number) * (1 + t.pctVsAverage / 100) - t.value!) < 1e-6);
  });
  const zones = ["NEMA", "SEMA", "WCMA"].map((z) => regimes.areas.find((a) => a.area === z)!);
  ma.timeline.forEach((t, k) => assert.ok(Math.abs(zones.reduce((s, z) => s + z.timeline[k].value!, 0) - t.value!) < 0.01, `${t.date}: MA = sum of zones`));
  const months = monthlyTotals(ma.timeline);
  assert.equal(months[0].ym, "2020-01");
  const last = ma.timeline[ma.timeline.length - 1].date;
  assert.ok(months[months.length - 1].ym <= last.slice(0, 7), "no month past the data");
  const jan = ma.timeline.filter((t) => t.date.startsWith("2020-01")).reduce((s, t) => s + t.value!, 0);
  assert.ok(Math.abs(months[0].gwh - jan) < 1e-9);
});
