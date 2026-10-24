// The nowcast panel draws regimes.json as the backend wrote it: these pin the data prep to the live file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { addMonths } from "./format.ts";
import type { GridRegimes } from "./model.ts";
import { STACK, Z_LIM, forecastBars, headline, nextLine, nowPoints, pctPerSd } from "./nowcast.ts";

const regimes = JSON.parse(readFileSync(new URL("../../../Backend/data/build/regimes.json", import.meta.url), "utf8")) as GridRegimes;

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
