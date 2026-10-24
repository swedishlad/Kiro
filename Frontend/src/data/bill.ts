// Reads the numbers that matter off the text of a Massachusetts electric bill (OCR output or pasted
// text). Pure and heuristic: every field may come back null, and the page always lets the viewer
// check and correct what was read before anything is compared.
//
// Bills from National Grid, Eversource and Unitil differ in layout but share a vocabulary: a
// billing period, total kWh (repeated on most charge lines), an amount due, a supply or
// generation rate per kWh, and section totals for delivery and supply. Each field keeps the line
// it was read from as evidence.

import { MONTHS } from "./format.ts";
import type { UtilityId } from "./model.ts";

export interface BillFields {
  utility: UtilityId | null;
  kwh: number | null;
  totalDollars: number | null;
  /** Supply (generation) rate in cents per kWh — basic service or a competitive supplier. */
  supplyCents: number | null;
  /** ISO dates, YYYY-MM-DD */
  periodStart: string | null;
  periodEnd: string | null;
  days: number | null;
  /** The date the bill was issued; dates the bill when no service period was read. */
  statementDate: string | null;
  /** Section totals for this period's charges, when the bill prints them */
  supplyDollars: number | null;
  deliveryDollars: number | null;
}

export type BillEvidence = Partial<Record<keyof BillFields, string>>;

export interface ParsedBill {
  fields: BillFields;
  evidence: BillEvidence;
}

// ----------------------------------------------------------------------------- helpers

/** OCR often reads "kWh" as "kwh", "KWH", "kW h" or "kVVh"; fold them into one token. */
function normalize(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[|]/g, " ")
    .replace(/k\s?(?:w|vv)\s?h(?:rs?)?\b/gi, "kWh")
    .replace(/[ \t]+/g, " ");
}

const toNumber = (s: string): number => Number(s.replace(/[,\s$]/g, ""));

const MONTH_RE = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const NUMERIC_DATE = "(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})";
const WORD_DATE = `${MONTH_RE}\\s+(\\d{1,2}),?\\s+(\\d{4})`;

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

function readDate(s: string): string | null {
  let m = new RegExp(`^${NUMERIC_DATE}$`).exec(s.trim());
  if (m) return isoDate(Number(m[3]), Number(m[1]), Number(m[2]));
  m = new RegExp(`^${WORD_DATE}$`, "i").exec(s.trim());
  if (m) {
    const month = MONTHS.findIndex((x) => x.toLowerCase() === m![1].slice(0, 3).toLowerCase()) + 1;
    return isoDate(Number(m[3]), month, Number(m[2]));
  }
  return null;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

// ----------------------------------------------------------------------------- fields

function findUtility(text: string): { id: UtilityId; line: string } | null {
  const lines = text.split("\n");
  const hit = (re: RegExp) => lines.find((l) => re.test(l));
  let line = hit(/national\s*grid|massachusetts\s+electric|nantucket\s+electric/i);
  if (line) return { id: "NG", line };
  line = hit(/unitil|fitchburg\s+gas/i);
  if (line) return { id: "UNITIL", line };
  line = hit(/eversource|nstar/i);
  if (line) {
    // Eversource West is the former WMECo territory; its bills name Western Massachusetts.
    const west = hit(/western\s+mass|wmeco|springfield|pittsfield|westfield|greenfield|agawam/i);
    return west ? { id: "EV_WEST", line: west } : { id: "EV_EAST", line };
  }
  return null;
}

function findPeriod(text: string): { start: string | null; end: string | null; days: number | null; line?: string } {
  const lines = text.split("\n");
  const anyDate = new RegExp(`${NUMERIC_DATE}|${WORD_DATE}`, "gi");
  const separator = /^\s*(?:-|–|—|to|thru|through)\s*$/i;
  const daysRe = /(\d{2})\s*days\b|days\s*(?:in\s*(?:billing\s*)?period|billed)?\s*:?\s*(\d{2})\b/i;
  // Prefer a date range on a line that names the period; fall back to the first range anywhere.
  const named = (l: string) => Number(/service|billing|period|from/i.test(l));
  const ranked = [...lines].sort((a, b) => named(b) - named(a));
  for (const line of ranked) {
    const dates = [...line.matchAll(anyDate)];
    for (let i = 0; i + 1 < dates.length; i++) {
      const a = dates[i];
      const b = dates[i + 1];
      // Two dates joined by "to" or a dash form a range; a due date beside a read date does not.
      if (!separator.test(line.slice(a.index + a[0].length, b.index))) continue;
      const start = readDate(a[0]);
      const end = readDate(b[0]);
      if (!start || !end) continue;
      const days = daysBetween(start, end);
      if (days > 15 && days < 45) return { start, end, days, line: line.trim() };
    }
  }
  for (const line of lines) {
    const d = daysRe.exec(line);
    const n = d ? Number(d[1] ?? d[2]) : NaN;
    if (n >= 20 && n <= 40) return { start: null, end: null, days: n, line: line.trim() };
  }
  return { start: null, end: null, days: null };
}

/**
 * Total kWh. Bills repeat the period's usage on most charge lines ("Distribution 612 kWh x ..."),
 * so the most frequent whole-number kWh wins; a line that says total/usage/used breaks ties.
 */
function findKwh(text: string): { kwh: number; line: string } | null {
  const counts = new Map<number, { n: number; score: number; line: string }>();
  for (const line of text.split("\n")) {
    const re = /(?<![\d.,$])(\d{1,3}(?:,\d{3})+|\d{1,5})(?!\.\d)\s*kWh\b(?!\s*\/)/g;
    for (const m of line.matchAll(re)) {
      const v = toNumber(m[1]);
      if (v < 5 || v > 20_000) continue;
      const keyword = /total|usage|used|energy\s+use|billed|consumption/i.test(line) ? 2 : 0;
      const prev = counts.get(v) ?? { n: 0, score: 0, line: line.trim() };
      counts.set(v, { n: prev.n + 1, score: prev.score + 1 + keyword, line: keyword ? line.trim() : prev.line });
    }
  }
  let best: { kwh: number; line: string; score: number } | null = null;
  for (const [kwh, c] of counts) {
    if (!best || c.score > best.score || (c.score === best.score && kwh > best.kwh)) best = { kwh, line: c.line, score: c.score };
  }
  return best ? { kwh: best.kwh, line: best.line } : null;
}

const AMOUNT = /\$?\s?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})(?!\d)/;

function findTotal(text: string): { dollars: number; line: string } | null {
  const lines = text.split("\n");
  const keys = [
    /total\s+amount\s+due/i,
    /amount\s+due/i,
    /total\s+(?:amount\s+)?due/i,
    /please\s+pay/i,
    /balance\s+due/i,
    /total\s+current\s+charges/i,
    /total\s+charges\s+(?:this|for\s+this)\s+period/i,
    /new\s+charges/i,
    /current\s+charges/i,
  ];
  for (const key of keys) {
    for (let i = 0; i < lines.length; i++) {
      if (!key.test(lines[i])) continue;
      const after = lines[i].slice(lines[i].search(key));
      const m = AMOUNT.exec(after) ?? AMOUNT.exec(lines[i + 1] ?? "");
      if (m) {
        const v = toNumber(m[1]);
        if (v > 0 && v < 10_000) return { dollars: v, line: lines[i].trim() };
      }
    }
  }
  return null;
}

/**
 * Supply rate. Charge lines inside the supply section (after a "Supply" heading, before the next
 * "Delivery" heading) or naming generation/basic service carry it as $/kWh ("x $0.14123") or ¢/kWh.
 * Falls back to the supply section's total divided by kWh.
 */
function findSupplyRate(text: string, kwh: number | null): { cents: number; line: string } | null {
  const lines = text.split("\n");
  const rateDollars = /(?:kWh\s*[x×@*]\s*|@\s*)\$?\s?(0?\.\d{3,6})|\$?\s?(0?\.\d{3,6})\s*(?:\/|per)\s*kWh/i;
  const rateCents = /(\d{1,2}\.\d{1,4})\s*(?:¢|cents?)\s*(?:\/|per)?\s*kWh/i;
  let inSupply = false;
  let supplyTotal: { dollars: number; line: string } | null = null;
  for (const line of lines) {
    if (/supply|generation|supplier|basic\s+service/i.test(line)) inSupply = true;
    else if (/delivery|distribution|transmission|customer\s+charge/i.test(line)) inSupply = false;
    if (!inSupply) continue;
    const d = rateDollars.exec(line);
    if (d) {
      const v = Number(d[1] ?? d[2]) * 100;
      if (v >= 3 && v <= 60) return { cents: v, line: line.trim() };
    }
    const c = rateCents.exec(line);
    if (c) {
      const v = Number(c[1]);
      if (v >= 3 && v <= 60) return { cents: v, line: line.trim() };
    }
    if (!supplyTotal && /total\s+supply|supply\s+(?:services|charges)\s*(?:total)?/i.test(line)) {
      const m = AMOUNT.exec(line.slice(line.search(/total|supply/i)));
      if (m) supplyTotal = { dollars: toNumber(m[1]), line: line.trim() };
    }
  }
  if (supplyTotal && kwh) {
    const v = (supplyTotal.dollars / kwh) * 100;
    if (v >= 3 && v <= 60) return { cents: v, line: supplyTotal.line };
  }
  return null;
}

/** The issue date: "Statement Date: 08/12/2026", "Bill date Feb 7, 2026". */
function findStatementDate(text: string): { date: string; line: string } | null {
  const key = /(?:statement|bill(?:ing)?|invoice)\s+date|date\s+(?:of\s+)?(?:bill|statement)|date\s+(?:issued|mailed)/i;
  const anyDate = new RegExp(`${NUMERIC_DATE}|${WORD_DATE}`, "i");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].search(key);
    if (at < 0) continue;
    const m = anyDate.exec(lines[i].slice(at)) ?? anyDate.exec(lines[i + 1] ?? "");
    const date = m ? readDate(m[0]) : null;
    if (date) return { date, line: lines[i].trim() };
  }
  return null;
}

/** A section total such as "Total Supply Services $115.47" or "Total Delivery Charges 118.20". */
function findSectionTotal(text: string, key: RegExp): { dollars: number; line: string } | null {
  for (const line of text.split("\n")) {
    const at = line.search(key);
    if (at < 0) continue;
    const m = AMOUNT.exec(line.slice(at));
    const v = m ? toNumber(m[1]) : NaN;
    if (v > 0 && v < 10_000) return { dollars: v, line: line.trim() };
  }
  return null;
}

// ----------------------------------------------------------------------------- public

export function parseBillText(raw: string): ParsedBill {
  const text = normalize(raw);
  const evidence: BillEvidence = {};

  const utility = findUtility(text);
  if (utility) evidence.utility = utility.line.trim();
  const period = findPeriod(text);
  if (period.line) {
    if (period.start) evidence.periodStart = period.line;
    if (period.end) evidence.periodEnd = period.line;
    evidence.days = period.line;
  }
  const kwh = findKwh(text);
  if (kwh) evidence.kwh = kwh.line;
  const total = findTotal(text);
  if (total) evidence.totalDollars = total.line;
  const supply = findSupplyRate(text, kwh?.kwh ?? null);
  if (supply) evidence.supplyCents = supply.line;
  const statement = findStatementDate(text);
  if (statement) evidence.statementDate = statement.line;
  const supplyTotal = findSectionTotal(text, /total\s+(?:supply|supplier|generation)/i);
  if (supplyTotal) evidence.supplyDollars = supplyTotal.line;
  const deliveryTotal = findSectionTotal(text, /total\s+delivery/i);
  if (deliveryTotal) evidence.deliveryDollars = deliveryTotal.line;

  return {
    fields: {
      utility: utility?.id ?? null,
      kwh: kwh?.kwh ?? null,
      totalDollars: total?.dollars ?? null,
      supplyCents: supply ? Math.round(supply.cents * 1000) / 1000 : null,
      periodStart: period.start,
      periodEnd: period.end,
      days: period.days,
      statementDate: statement?.date ?? null,
      supplyDollars: supplyTotal?.dollars ?? null,
      deliveryDollars: deliveryTotal?.dollars ?? null,
    },
    evidence,
  };
}

/** The calendar month a billing period mostly falls in (its midpoint), as YYYY-MM. */
export function billMonth(start: string | null, end: string | null): string | null {
  if (end && start) {
    const mid = new Date((Date.parse(start) + Date.parse(end)) / 2);
    return mid.toISOString().slice(0, 7);
  }
  return end ? end.slice(0, 7) : null;
}

const shiftDays = (iso: string, days: number): string => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The bill month, from the best date the bill gave: its service period, else the period's end and
 * length, else the statement date (meters are read a few days before the bill is issued, and a
 * period runs about a month, so its middle sits about 18 days earlier).
 */
export function inferBillMonth(f: Pick<BillFields, "periodStart" | "periodEnd" | "days" | "statementDate">): { ym: string; from: "period" | "statement" } | null {
  if (f.periodStart && f.periodEnd) return { ym: billMonth(f.periodStart, f.periodEnd)!, from: "period" };
  if (f.periodEnd) return { ym: shiftDays(f.periodEnd, -Math.round((f.days ?? 30) / 2)).slice(0, 7), from: "period" };
  if (f.statementDate) return { ym: shiftDays(f.statementDate, -18).slice(0, 7), from: "statement" };
  return null;
}
