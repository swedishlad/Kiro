// Bill reader and comparison tests. The sample texts follow the layout of each utility's bill, with
// the kind of noise OCR adds (odd spacing, "KWH", stray pipes); the amounts are made up.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { billMonth, inferBillMonth, parseBillReadings, parseBillText } from "./bill.ts";
import { buildReport, compareBill, suggestionsFor, type Reference } from "./billCompare.ts";
import { ocrRows } from "./ocr.ts";
import { textLines } from "./textLayout.ts";
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
  const down = runs.map((r) => ({ ...r, y: -r.y }));
  assert.equal(textLines(down), "nationalgrid\nTotal Energy Used 610 kWh\nAmount Due $233.67");
  const { fields } = parseBillText(textLines(down));
  assert.equal(fields.utility, "NG");
  assert.equal(fields.kwh, 610);
  assert.equal(fields.totalDollars, 233.67);
});

test("takes the supply rate from the supply total when no per-kWh rate is printed", () => {
  const { fields } = parseBillText("National Grid\nTotal usage 500 kWh\nSupply Services\nTotal Supply Services $95.00\nAmount Due $180.00");
  assert.equal(fields.supplyCents, 19);
});

// ----------------------------------------------------------------------------- real layouts
// Laid out as the utilities print them (line order and labels from real bills' PDF text and OCR
// output); names, numbers and amounts are made up.

const NG_REAL = `nationalgrid
SERVICE FOR BILLING PERIOD PAGE 1 of 2
JANE Q CUSTOMER Dec 21, 2025 to Jan 23, 2026
ACCOUNT NUMBER PLEASE PAY BY AMOUNT DUE
55210-31907 Feb 20, 2026 $ 396.05
DATE BILL ISSUED
Jan 28, 2026
Previous Balance 250.91
Payment Received on DEC 30 ( Check) - 78.95
Balance Forward 171.96
Current Charges + 224.09
Amount Due $ 396.05
SERVICE PERIOD Dec 21 - Jan 23 NUMBER OF DAYS IN PERIOD 33 METER NUMBER 0012345678
Energy 12962 Actual 12303 Actual 659 1 659 kWh
Total Energy 659 kWh
Delivery Services
Customer Charge 7.00
Dist Chg 0.08176 x 659 kWh 53.88
Transition Charge -0.00083 x 659 kWh -0.55
Total Delivery Services $ 115.90
Supply Services
SUPPLIER National Grid
Basic Service Fixed 0.16418 x 659 kWh 108.19
Total Supply Services $ 108.19`;

const EV_REAL = `Eversource
Account Number: 5112 345 6789 Total Amount Due
Statement Date: 08/08/24 $243.81
by 09/03/24
Service from 07/09/24 - 08/06/24 29 Days Next read date on or about: Sep 09, 2024
Electric Account Summary
Amount Due On 07/03/24 $180.20
Last Payment Received On 07/28/24 -$180.20
Balance Forward $0.00
Current Charges/Credits
Electric Supply Services $104.55
Delivery Services $139.26
Total Current Charges $243.81
Total Amount Due $243.81
Meter Current Previous Current Reading
Number Read Read Usage Type
7744123 92285 91549 736 Actual
www.eversource.com Customer Charge $10.00
Pay by Phone: 888-783-6618 Distribution Charge 736 kWh X .08318 $61.22
Transition Charge 736 kWh X -.00361 -$2.66
Subtotal Delivery Services $139.26
Supplier (Eversource) (Basic Svc Fixed)
Oct Nov Dec Jan
Generation Service Charge 736 kWh X .14205 $104.55
826 999 1107 924
Subtotal Supplier Services $104.55
Total Cost of Electricity $243.81`;

test("National Grid: this period's charges, not an amount due that carries an unpaid balance", () => {
  const { fields } = parseBillText(NG_REAL);
  assert.equal(fields.utility, "NG");
  assert.equal(fields.kwh, 659);
  assert.equal(fields.totalDollars, 224.09);
  assert.equal(fields.supplyCents, 16.418, "rate first: 0.16418 x 659 kWh");
  assert.equal(fields.periodStart, "2025-12-21");
  assert.equal(fields.periodEnd, "2026-01-23");
  assert.equal(fields.days, 33);
  assert.equal(fields.statementDate, "2026-01-28");
  assert.equal(fields.supplyDollars, 108.19);
  assert.equal(fields.deliveryDollars, 115.9);
});

test("National Grid's year-less service period is dated by the bill's issue date, across New Year", () => {
  const { fields } = parseBillText("National Grid\nDATE BILL ISSUED\nJan 28, 2026\nSERVICE PERIOD Dec 21 - Jan 23 NUMBER OF DAYS IN PERIOD 33\nTotal Energy 659 kWh");
  assert.equal(fields.periodStart, "2025-12-21");
  assert.equal(fields.periodEnd, "2026-01-23");
  assert.equal(fields.days, 33);
});

test("Eversource: the previous bill's 'Amount Due On' is skipped; quantity-first bare rates; both ends counted", () => {
  const { fields } = parseBillText(EV_REAL);
  assert.equal(fields.utility, "EV_EAST");
  assert.equal(fields.kwh, 736, "usage-chart numbers have no kWh and are not usage");
  assert.equal(fields.totalDollars, 243.81);
  assert.equal(fields.supplyCents, 14.205, "736 kWh X .14205");
  assert.equal(fields.days, 29, "the printed count, one more than the dates' difference");
  assert.equal(billMonth(fields.periodStart, fields.periodEnd), "2024-07");
  assert.equal(fields.supplyDollars, 104.55);
  assert.equal(fields.deliveryDollars, 139.26);
});

test("Eversource West: named before National Grid's 'Massachusetts Electric', and its decimal kWh", () => {
  const { fields } = parseBillText(`Western Massachusetts Electric Company
Total Amount Due by 05/02/23 $73.83
Service from 03/03/23 - 04/03/23 32 Days
Supplier (RATE R-1 - BASIC FIXED)
Generation Srvc Chrg 149.90kWh X $0.10650 $15.96
Subtotal Supplier Services $15.96
Total Current Charges $73.83`);
  assert.equal(fields.utility, "EV_WEST");
  assert.equal(fields.kwh, 149.9);
  assert.equal(fields.supplyCents, 10.65);
  assert.equal(fields.totalDollars, 73.83);
});

test("a four-digit usage keeps its supply rate", () => {
  const { fields } = parseBillText("National Grid\nElectricity Supply 0.14990 x 1184 kWh 177.48\nTotal Supply Services $ 177.48");
  assert.equal(fields.kwh, 1184);
  assert.equal(fields.supplyCents, 14.99);
});

// ----------------------------------------------------------------------------- OCR output

test("folds OCR misreadings: S for $, a lost decimal point, O for 0, kWn for kWh", () => {
  const { fields } = parseBillText(`nationalgrld
BILLING PERIOD Jan5,2026 to Feb 4, 2026
Total Energy 612 KWn
Current Charges +22399
Amount Due S223.99
Basic Service Fixed O.18930 x 612 kWh 115.85`);
  assert.equal(fields.utility, "NG");
  assert.equal(fields.kwh, 612);
  assert.equal(fields.totalDollars, 223.99);
  assert.equal(fields.supplyCents, 18.93);
  assert.equal(fields.periodStart, "2026-01-05");
});

test("pairs a column of labels with the column of amounts OCR read after it", () => {
  // Real OCR output of a dim photo of an Eversource bill: the summary's labels, a heading from the
  // next column, then the amounts, and charge lines whose amounts were lost.
  const { fields } = parseBillText(`Eversource Toi Amount Dye
Account Number: 5112 345 6789 $282.76
Statement Date: 04/14/26 by 05/05/26
Service from 03/11/26 - 04/10/26 31 Days Next read date on or about: May 11, 2026
ELECTRIC ACCOUNT SUMMARY
Amount Due On 03/13/26 $260.02
Last Payment Received On 03/28/26 -$260.02
Balance Forward $0.00
Current Charges/Credits
Electric Supply Services
Delivery Services
Total Current Charges
Total Amount Due
MONTHLY KWH USE
$131.13
$151.63
$282.76 Meter Number Current Read Previous Read Current Usage Reading Type
$282.76 7744123 32724 31877 847 Actual
Distribution Charge 847 kWh X .08318
Transition Charge 847 kWh X -,00361
Subtotal Delivery Services
SUPPLIER (EVERSOURCE) (BASIC SVC FIXED)
Generation Service Charge 847 kWh X .15482
Subtotal Supplier Services`);
  assert.equal(fields.totalDollars, 282.76);
  assert.equal(fields.supplyDollars, 131.13);
  assert.equal(fields.deliveryDollars, 151.63);
  assert.equal(fields.supplyCents, 15.482);
  assert.equal(fields.kwh, 847);
  assert.equal(fields.days, 31);
});

test("a second reading fills gaps, and the supply rate is checked against both readings' totals", () => {
  const first = "Unitil\nService Period: 11/14/2025 to 12/15/2025 (31 days)\nDistribution Charge 455 kWh @ $0.06312 $28.72\nTotal Delivery Service $66.73";
  // The supply line was lost in both; under the supply heading sits a delivery rate.
  const second = "Unitil\nSUPPLY SERVICE\n455 kWh @ $0.06312\nTotal Amount Due $159.60\nService Period: 11/15/2025 to 12/15/2025";
  const { fields } = parseBillReadings([first, second]);
  assert.equal(fields.totalDollars, 159.6, "filled from the second reading");
  assert.equal(fields.periodStart, "2025-11-14", "the first reading's period stands");
  assert.ok(Math.abs(fields.supplyCents! - 20.41) < 0.01, `(total − delivery) ÷ kWh, not the delivery rate: ${fields.supplyCents}`);
  assert.deepEqual(parseBillReadings([first, ""]).fields, parseBillText(first).fields);
});

test("rebuilds rows from OCR words on a tilted page, so a label meets its amount across the gap", () => {
  const tilt = 0.035; // about 2°
  const line = (x0: number, y0: number, words: [string, number, number][]) => ({
    baseline: { x0, y0, x1: x0 + 500, y1: y0 + 500 * tilt, has_baseline: true },
    rowAttributes: { row_height: 30 },
    words: words.map(([text, a, b]) => ({ text, bbox: { x0: a, y0: y0 - 25, x1: b, y1: y0 + 3 } })),
  });
  const rows = ocrRows([
    line(100, 1000, [["Total", 100, 180], ["Supply", 190, 280], ["Services", 290, 420]]),
    line(100, 1045, [["Delivery", 100, 220], ["Services", 230, 360]]),
    // the amount, far right on the first row: lower on the image because of the tilt
    line(1800, 1000 + 1700 * tilt, [["$177.48", 1800, 1950]]),
  ]);
  assert.equal(rows, "Total Supply Services $177.48\nDelivery Services");
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
