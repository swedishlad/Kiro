// Bill reader and comparison tests. The sample texts follow the layout of each utility's bill, with
// the kind of noise OCR adds (odd spacing, "KWH", stray pipes); the amounts are made up.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { billMonth, inferBillMonth, parseBillText } from "./bill.ts";
import { buildReport, compareBill, suggestionsFor, type Reference } from "./billCompare.ts";
import { textLines } from "./pdf.ts";
import { parseEia, parseFixedRates, parseRecs, type ConsumptionStats } from "./model.ts";
import { termSpans } from "./savings.ts";

const backend = new URL("../../../Backend/data/", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, backend), "utf8");
const stats = JSON.parse(read("build/consumption_stats.json")) as ConsumptionStats;
const ref: Reference = {
  typicalMonthlyKwh: stats.typicalAccount.monthlyKwh,
  typicalYear: 2025,
  seasonalShares: stats.seasonalShares,
  eia: parseEia(read("build/eia_ma_monthly.csv")),
  recs: parseRecs(read("build/recs_ma.csv")),
  spans: termSpans(parseFixedRates(read("snapshot/fixed_residential_cents_2026-07-02.csv"))),
};

const NATIONAL_GRID = `nationalgrid
Massachusetts Electric Company
ACCOUNT NUMBER 12345-67890     PLEASE PAY BY Mar 2, 2026
Service Period: Jan 5, 2026 to Feb 4, 2026 | No. of days: 30
METER NUMBER 0012345   Actual Reading 45,612   Previous 45,002
Total Energy Used 610 KWH
Delivery Services
Customer Charge                              $7.00
Distribution Charge 0.09016 x 610 kWh       $55.00
Transmission Charge 0.05001 x 610 kWh       $30.51
Total Delivery Services                    $118.20
Supply Services
SUPPLIER National Grid
Basic Service Fixed 610 kWh x $0.18930      $115.47
Total Supply Services                      $115.47
Amount Due                                 $233.67`;

const EVERSOURCE = `Eversource
Statement Date: 08/12/2026
Service from 07/09/2026 - 08/10/2026   32 Days
Your Energy Use: 812 kWh
Amount Due on 09/03/2026 $ 241.06
Delivery
Customer Charge 10.00
Distribution Chrg 812kwh X .07894 64.10
Supply
Generation Charge  XYZ Energy LLC   812 kWh @ 14.990 cents/kWh  121.72
Total Current Charges $241.06`;

const UNITIL = `UNITIL - Fitchburg Gas and Electric Light Company
Billing Period 11/14/25 to 12/15/25
Total kWh used 455
Supply Service: Basic Service 455 kWh x $0.2041 = $92.87
Delivery: Distribution 455 kWh x $0.11 = $50.05
Total Amount Due $151.40`;

test("reads a National Grid bill", () => {
  const { fields, evidence } = parseBillText(NATIONAL_GRID);
  assert.equal(fields.utility, "NG");
  assert.equal(fields.kwh, 610);
  assert.equal(fields.totalDollars, 233.67);
  assert.equal(fields.supplyCents, 18.93);
  assert.equal(fields.periodStart, "2026-01-05");
  assert.equal(fields.periodEnd, "2026-02-04");
  assert.equal(fields.days, 30);
  assert.equal(fields.supplyDollars, 115.47);
  assert.equal(fields.deliveryDollars, 118.2);
  assert.match(evidence.kwh ?? "", /Total Energy Used/);
  assert.equal(billMonth(fields.periodStart, fields.periodEnd), "2026-01");
});

test("reads an Eversource bill with a competitive supplier in cents", () => {
  const { fields } = parseBillText(EVERSOURCE);
  assert.equal(fields.utility, "EV_EAST");
  assert.equal(fields.kwh, 812);
  assert.equal(fields.totalDollars, 241.06);
  assert.equal(fields.supplyCents, 14.99);
  assert.equal(fields.periodStart, "2026-07-09");
  assert.equal(fields.days, 32);
  assert.equal(fields.statementDate, "2026-08-12");
  assert.equal(billMonth(fields.periodStart, fields.periodEnd), "2026-07");
});

test("reads a Unitil bill with two-digit years", () => {
  const { fields } = parseBillText(UNITIL);
  assert.equal(fields.utility, "UNITIL");
  assert.equal(fields.kwh, 455);
  assert.equal(fields.totalDollars, 151.4);
  assert.equal(fields.supplyCents, 20.41);
  assert.equal(fields.periodStart, "2025-11-14");
  assert.equal(fields.periodEnd, "2025-12-15");
});

test("returns nulls rather than guesses for unreadable text", () => {
  const { fields } = parseBillText("blurry photo\n$ 12 3\nthank you");
  assert.deepEqual(fields, {
    utility: null,
    kwh: null,
    totalDollars: null,
    supplyCents: null,
    periodStart: null,
    periodEnd: null,
    days: null,
    statementDate: null,
    supplyDollars: null,
    deliveryDollars: null,
  });
});

test("dates a bill by its statement date when no service period was read", () => {
  const { fields } = parseBillText("Eversource\nBill date: Mar 4, 2026\nTotal kWh 702\nAmount due $210.00");
  assert.equal(fields.periodStart, null);
  assert.equal(fields.statementDate, "2026-03-04");
  // Read a few days before the bill goes out, so the period mostly falls in February.
  assert.deepEqual(inferBillMonth(fields), { ym: "2026-02", from: "statement" });
  assert.deepEqual(inferBillMonth(parseBillText(NATIONAL_GRID).fields), { ym: "2026-01", from: "period" });
  assert.equal(inferBillMonth({ periodStart: null, periodEnd: null, days: null, statementDate: null }), null);
});

test("rebuilds PDF text runs into lines in reading order", () => {
  // PDF.js gives positioned runs, not lines: a label and its amount are separate runs on one baseline,
  // and runs arrive in content order, not reading order.
  const runs = [
    { str: "$233.67", x: 480, y: 600.4, width: 40, height: 10 },
    { str: "Amount Due", x: 72, y: 600, width: 60, height: 10 },
    { str: "Total Energy Used ", x: 72, y: 640, width: 90, height: 10 },
    { str: "610", x: 162, y: 640, width: 15, height: 10 },
    { str: " kWh", x: 177, y: 640, width: 20, height: 10 },
    { str: "national", x: 72, y: 700, width: 40, height: 12 },
    { str: "grid", x: 112, y: 700, width: 20, height: 12 },
    { str: "   ", x: 300, y: 650, width: 10, height: 10 },
  ];
  assert.equal(textLines(runs), "nationalgrid\nTotal Energy Used 610 kWh\nAmount Due $233.67");
  const { fields } = parseBillText(textLines(runs));
  assert.equal(fields.utility, "NG");
  assert.equal(fields.kwh, 610);
  assert.equal(fields.totalDollars, 233.67);
});

test("takes the supply rate from the supply total when no per-kWh rate is printed", () => {
  const { fields } = parseBillText("National Grid\nTotal usage 500 kWh\nSupply Services\nTotal Supply Services $95.00\nAmount Due $180.00");
  assert.equal(fields.supplyCents, 19);
});

test("compares a high summer bill with an expensive supplier and suggests switching", () => {
  const bill = { utility: "EV_EAST" as const, kwh: 1200, totalDollars: 380, supplyCents: 18.5, billYm: "2026-07", days: 30 };
  const c = compareBill(bill, ref);
  assert.ok(c.avgPriceIsSameMonth, "EIA has July 2026");
  assert.ok(c.basicCents !== null, "Eversource East has a basic-service term covering July 2026");
  assert.ok(c.usageRatio > 1.2);
  assert.ok(c.shareOfHomesBelow > 0.5 && c.shareOfHomesBelow <= 1);
  assert.ok(Math.abs(c.monthKwh - (1200 / 30) * 30.44) < 1e-9);
  const s = suggestionsFor(bill, c);
  const ids = s.map((x) => x.id);
  if ((c.supplyGapCents ?? 0) > 0.25) assert.equal(ids[0], "switch-supply");
  assert.ok(ids.includes("assessment"));
  assert.ok(ids.includes("cooling"));
  assert.ok(ids.includes("community-solar") && ids.includes("rooftop-solar"));
  // Every figure in the copy is a real number, never NaN or undefined.
  for (const x of s) assert.doesNotMatch(`${x.why} ${x.how}`, /NaN|undefined|Infinity/);
});

test("a low bill on basic service gets no switching or efficiency push", () => {
  const bill = { utility: "NG" as const, kwh: 280, totalDollars: 95, supplyCents: null, billYm: "2026-04", days: null };
  const c = compareBill(bill, ref);
  assert.equal(c.supplyGapCents, null);
  const ids = suggestionsFor(bill, c).map((x) => x.id);
  assert.ok(!ids.includes("switch-supply") && !ids.includes("assessment"));
  assert.ok(ids.includes("low-use"));
});

test("falls back to the latest twelve months when EIA has no data for the bill's month", () => {
  const c = compareBill({ utility: "NG", kwh: 600, totalDollars: null, supplyCents: null, billYm: "2030-01", days: null }, ref);
  assert.equal(c.avgPriceIsSameMonth, false);
  assert.equal(c.avgPriceYm, ref.eia[ref.eia.length - 1].ym);
  assert.equal(c.basicCents, null);
});

test("builds the full report: a year of use, its cost, and where the bill's money goes", () => {
  const bill = { utility: "NG" as const, kwh: 610, totalDollars: 233.67, supplyCents: 18.93, billYm: "2026-01", days: 30, supplyDollars: 115.47, deliveryDollars: 118.2 };
  const r = buildReport(bill, ref);
  assert.equal(r.year.length, 12);
  const yearKwh = r.year.reduce((s, m) => s + m.yourKwh, 0);
  assert.ok(Math.abs(yearKwh - r.comparison.annualKwh) < 1e-6, "the months add up to the year");
  assert.ok(Math.abs(r.year[0].yourKwh - r.comparison.monthKwh) < 1e-9, "the bill's own month is the bill");
  assert.ok(r.annualPriceIsYours);
  assert.ok(Math.abs(r.annualDollars - (r.comparison.annualKwh * r.comparison.yourPriceCents!) / 100) < 1e-9);
  assert.deepEqual(r.breakdown, { supply: 115.47, delivery: 118.2, other: 0 });
  const withTaxes = buildReport({ ...bill, totalDollars: 250 }, ref);
  assert.ok(Math.abs(withTaxes.breakdown!.other - 16.33) < 1e-9);
  assert.equal(buildReport({ ...bill, deliveryDollars: null }, ref).breakdown, null);
  for (const s of r.suggestions) assert.doesNotMatch(`${s.why} ${s.how} ${s.estimate ?? ""}`, /NaN|undefined|Infinity/);
  assert.ok(r.suggestions.find((s) => s.id === "rooftop-solar")?.estimate);
});

test("a bill without one of the four utilities still gets usage and cost, with no basic-service comparison", () => {
  const bill = { utility: null, kwh: 900, totalDollars: 200, supplyCents: 12, billYm: "2026-07", days: null };
  const r = buildReport(bill, ref);
  assert.equal(r.comparison.basicCents, null);
  assert.equal(r.comparison.supplyGapYearDollars, null);
  const ids = r.suggestions.map((s) => s.id);
  assert.ok(!ids.includes("switch-supply") && !ids.includes("supplier-ok"));
  for (const s of r.suggestions) assert.doesNotMatch(`${s.why} ${s.how}`, /NaN|undefined|null/);
});
