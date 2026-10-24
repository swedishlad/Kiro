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

/**
 * Folds OCR's usual misreadings into what the parser expects: "kWh" in its many shapes ("kwh",
 * "KWH", "kW h", "kVVh", "kWn"), "S" for a dollar sign, the letters O and l inside a number, a
 * decimal comma, stray spaces around a decimal point, and a decimal point lost from a charge
 * ("$22399"; bills print every charge with cents). Shorter numbers ("$ 923") are left alone: they
 * are as likely to be a misread as a lost point.
 */
function normalize(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[|]/g, " ")
    .replace(/k\s?(?:w|vv|vw|ww)\s?[hn](?:rs?)?\b/gi, "kWh")
    .replace(/(?<=\d)[Oo](?![A-Za-z])|(?<![A-Za-z])[Oo](?=\.?\d)/g, "0")
    .replace(/(?<=\d)[lI](?=\d)/g, "1")
    .replace(/(?<![A-Za-z0-9])S\s?(?=\d{1,3}(?:,\d{3})*\.\d{2}(?!\d))/g, "$")
    .replace(/(\$\s?\d{1,4}),(\d{2})(?!\d)/g, "$1.$2")
    .replace(/(\d)(?: \.|\. | \. )(\d{2})(?!\d)/g, "$1.$2")
    .replace(/(\$?0)\. (\d{3,6})(?!\d)/g, "$1.$2")
    .replace(/([$+]\s?)(\d{2,4})(\d{2})(?![\d.,])/g, "$1$2.$3")
    .replace(/[ \t]+/g, " ");
}

const toNumber = (s: string): number => Number(s.replace(/[,\s$]/g, ""));

const MONTH_RE = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const NUMERIC_DATE = "(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})";
const WORD_DATE = `${MONTH_RE}\\s*(\\d{1,2}),?\\s*(\\d{4})`;

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

const HAS_AMOUNT = /\d\.\d{2}(?!\d)/;
const AMOUNT_LED = /^\s*[+-]?\s*\$?\s?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})(?!\d)/;

/**
 * OCR sometimes reads a table column by column: a run of labels ("Delivery Services", "Total Current
 * Charges", "Total Amount Due"), then a run of lines that start with their amounts. Pairs them from
 * the bottom, as rows of one table, and adds the pairs as extra lines ("Total Amount Due $282.76").
 */
function realign(text: string): string {
  // A heading from a neighbouring column ("MONTHLY KWH USE") can land between the two runs; headings
  // are capitals with no money words, so they are left out of the pairing.
  const heading = (l: string) =>
    /[A-Z]{3}/.test(l) && !/[a-z]/.test(l.replace(/kWh/g, "")) && !HAS_AMOUNT.test(l) && !/total|due|charge|balance|amount|supply|delivery|service|pay/i.test(l);
  const lines = text.split("\n").filter((l) => l.trim() && !heading(l));
  const pairs: string[] = [];
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j < lines.length && !HAS_AMOUNT.test(lines[j]) && /[A-Za-z]{3}/.test(lines[j])) j++;
    let k = j;
    while (k < lines.length && AMOUNT_LED.test(lines[k])) k++;
    const labels = lines.slice(i, j);
    const amounts = lines.slice(j, k);
    if (labels.length >= 2 && amounts.length >= 2) {
      for (let t = 1; t <= Math.min(labels.length, amounts.length); t++) {
        pairs.push(`${labels[labels.length - t].trim()} ${AMOUNT_LED.exec(amounts[amounts.length - t])![0].trim()}`);
      }
    }
    i = Math.max(k, i + 1);
  }
  return pairs.length ? `${text}\n${pairs.reverse().join("\n")}` : text;
}

// ----------------------------------------------------------------------------- fields

function findUtility(text: string): { id: UtilityId; line: string } | null {
  const lines = text.split("\n");
  const hit = (re: RegExp) => lines.find((l) => re.test(l));
  let line = hit(/unitil|fitchburg\s+gas/i);
  if (line) return { id: "UNITIL", line };
  // Eversource West is the former WMECo territory; its bills name Western Massachusetts. Checked
  // before National Grid, whose company name ("Massachusetts Electric") sits inside WMECo's.
  const west = hit(/western\s+mass|wmeco|springfield|pittsfield|westfield|greenfield|agawam/i);
  line = hit(/ever\s?s[o0]urce|nstar/i);
  if (line) return west ? { id: "EV_WEST", line: west } : { id: "EV_EAST", line };
  line = hit(/western\s+massachusetts\s+electric|wmeco/i);
  if (line) return { id: "EV_WEST", line };
  line = hit(/nati[o0]nal\s*gr[i1l]d|massachusetts\s+electric|nantucket\s+electric/i);
  if (line) return { id: "NG", line };
  // A photo can lose the logo; each company's bill has its own wording.
  line = hit(/service\s+from\s+\d|subtotal\s+(?:supplier|delivery)\s+services|generation\s+service\s+charge|amount\s+due\s+on\s+\d/i);
  if (line) return west ? { id: "EV_WEST", line: west } : { id: "EV_EAST", line };
  line = hit(/date\s+bill\s+issued|number\s+of\s+days\s+in\s+period|\b\d{5}-\d{5}\b/i);
  if (line) return { id: "NG", line };
  return null;
}

interface Period {
  start: string | null;
  end: string | null;
  days: number | null;
  line?: string;
  daysLine?: string;
}

/** "Aug 17 - Sep 20" or "12/09 - 01/10": a range printed without years, dated by the bill's issue date. */
function yearlessRange(lines: string[], issued: string | null, years: number[]): { start: string; end: string; line: string } | null {
  const sep = "\\s*(?:-{1,2}|–|—|to|thru|through)\\s*";
  const word = new RegExp(`${MONTH_RE}\\s*(\\d{1,2})${sep}${MONTH_RE}\\s*(\\d{1,2})(?!\\d|\\s*,?\\s*\\d{4})`, "i");
  const numeric = new RegExp(`(?<![\\d/])(\\d{1,2})/(\\d{1,2})${sep}(\\d{1,2})/(\\d{1,2})(?![\\d/])`);
  const monthOf = (name: string) => MONTHS.findIndex((x) => x.toLowerCase() === name.slice(0, 3).toLowerCase()) + 1;
  const refYear = issued ? Number(issued.slice(0, 4)) : years.length ? Math.max(...years) : null;
  if (refYear === null) return null;
  const refMonth = issued ? Number(issued.slice(5, 7)) : 12;
  for (const line of lines) {
    let m = word.exec(line);
    let parts: number[] | null = m ? [monthOf(m[1]), Number(m[2]), monthOf(m[3]), Number(m[4])] : null;
    if (!parts) {
      m = numeric.exec(line);
      parts = m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null;
    }
    if (!parts) continue;
    const [m1, d1, m2, d2] = parts;
    // The period ends before the bill is issued, so a later month than the issue month is last year's.
    const endYear = m2 > refMonth + 1 ? refYear - 1 : refYear;
    const start = isoDate(m1 > m2 ? endYear - 1 : endYear, m1, d1);
    const end = isoDate(endYear, m2, d2);
    if (!start || !end) continue;
    const days = daysBetween(start, end);
    if (days > 15 && days < 45) return { start, end, line: line.trim() };
  }
  return null;
}

function findPeriod(text: string, issued: string | null): Period {
  const lines = text.split("\n");
  const anyDate = new RegExp(`${NUMERIC_DATE}|${WORD_DATE}`, "gi");
  const separator = /^\s*(?:-{1,2}|–|—|~|to|t0|thru|through)\s*$/i;
  const daysRe = /(\d{2})\s*days\b|days\s*(?:in\s*(?:billing\s*)?period|billed)?\s*:?\s*(\d{2})\b/i;
  // Prefer a date range on a line that names the period; fall back to the first range anywhere.
  const named = (l: string) => Number(/service|billing|period|from/i.test(l));
  const ranked = [...lines].sort((a, b) => named(b) - named(a));
  let range: { start: string; end: string; line: string } | null = null;
  const years: number[] = [];
  for (const line of ranked) {
    const dates = [...line.matchAll(anyDate)];
    for (const d of dates) {
      const iso = readDate(d[0]);
      if (iso) years.push(Number(iso.slice(0, 4)));
    }
    for (let i = 0; !range && i + 1 < dates.length; i++) {
      const a = dates[i];
      const b = dates[i + 1];
      // Two dates joined by "to" or a dash form a range; a due date beside a read date does not.
      if (!separator.test(line.slice(a.index + a[0].length, b.index))) continue;
      const start = readDate(a[0]);
      const end = readDate(b[0]);
      if (start && end && daysBetween(start, end) > 15 && daysBetween(start, end) < 45) range = { start, end, line: line.trim() };
    }
  }
  range ??= yearlessRange(lines, issued, years);
  // The day count the bill prints ("29 Days", "NUMBER OF DAYS IN PERIOD 34") is the one it used;
  // Eversource counts both ends of the range, one more than the dates' difference.
  let printed: { n: number; line: string } | null = null;
  for (const line of lines) {
    const d = daysRe.exec(line);
    const n = d ? Number(d[1] ?? d[2]) : NaN;
    if (n >= 20 && n <= 40) {
      printed = { n, line: line.trim() };
      break;
    }
  }
  if (range) {
    const span = daysBetween(range.start, range.end);
    const usePrinted = printed !== null && Math.abs(printed.n - span) <= 2;
    return { start: range.start, end: range.end, days: usePrinted ? printed!.n : span, line: range.line, daysLine: usePrinted ? printed!.line : undefined };
  }
  return printed ? { start: null, end: null, days: printed.n, line: printed.line } : { start: null, end: null, days: null };
}

/**
 * Total kWh. Bills repeat the period's usage on most charge lines ("0.08176 x 612 kWh",
 * "736 kWh X .14205"), so the most frequent kWh wins; a line that says total/usage/used breaks ties.
 * Older Eversource bills print it with decimals ("726.00kWh").
 */
function findKwh(text: string): { kwh: number; line: string } | null {
  const counts = new Map<number, { n: number; score: number; line: string }>();
  for (const line of text.split("\n")) {
    const re = /(?<![\d.,$])(\d{1,3}(?:,\d{3})+|\d{1,5})(?:\.(\d{1,2}))?(?![\d.])\s*kWh\b(?!\s*\/)/g;
    for (const m of line.matchAll(re)) {
      const v = toNumber(m[1]) + (m[2] ? Number(`0.${m[2]}`) : 0);
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
const AMOUNTS = new RegExp(AMOUNT.source, "g");
/** A line that is nothing but an amount: OCR often parts a label from its value. */
const AMOUNT_ONLY = /^\s*[+]?\s*\$?\s?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*$/;

/**
 * The first amount after `key` on line i, else an amount that starts one of the next few lines (on
 * its own, or with the next column's text after it), with how many lines away it was.
 */
function amountAfter(lines: string[], i: number, key: RegExp, reach = 4, alone = false): { dollars: number; away: number } | null {
  const m = AMOUNT.exec(lines[i].slice(Math.max(0, lines[i].search(key))));
  if (m) return { dollars: toNumber(m[1]), away: 0 };
  for (let j = i + 1, seen = 0; j < lines.length && seen < reach; j++) {
    if (!lines[j].trim()) continue;
    seen++;
    const next = (alone ? AMOUNT_ONLY : AMOUNT_LED).exec(lines[j]);
    if (next) return { dollars: toNumber(next[1]), away: seen };
  }
  return null;
}

/**
 * This period's charges. Bills print several totals: "Total Current Charges" is this period, while
 * "Amount Due" can include an unpaid balance (National Grid) and Eversource's "Amount Due On <date>"
 * is the previous bill. Each labelled amount is a candidate, weighted by its label, by how often the
 * same amount recurs on the bill (the total is repeated in the summary box, the account balance and
 * the payment stub), and by whether it equals the supply and delivery totals added up; one smaller
 * than either section total is a misread and is dropped.
 */
function findTotal(text: string, sections: number | null, floor: number | null, sectionsEqual = false): { dollars: number; line: string } | null {
  const lines = text.split("\n");
  const keys: [RegExp, number][] = [
    [/total\s+current\s+charges|total\s+charges\s+(?:this|for\s+this)\s+period|total\s+cost\s+of\s+electricity/i, 6],
    [/current\s+charges(?!\s*\/)|new\s+charges/i, 5],
    [/total\s+amount\s+due/i, 4.5],
    [/amount\s+due|total\s+due|please\s+pay|balance\s+due/i, 3.5],
  ];
  const all = [...text.matchAll(AMOUNTS)].map((m) => toNumber(m[1]));
  const candidates = new Map<number, { weight: number; line: string }>();
  for (let i = 0; i < lines.length; i++) {
    // Eversource's "Amount Due On <date>" is the previous bill, like a previous balance.
    if (/previous|prior|last\s+(?:bill|payment)|payment|amount\s+due\s+on\s+\d/i.test(lines[i])) continue;
    const key = keys.find(([re]) => re.test(lines[i]));
    if (!key) {
      // National Grid's balance box adds this period's charges with a plus ("Current Charges + 224.09");
      // OCR can part the plus and amount from the label.
      const plus = /(?:^|\s)\+\s?\$?\s?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})(?!\d)/.exec(lines[i]);
      const dollars = plus ? toNumber(plus[1]) : 0;
      if (dollars > 0 && dollars < 10_000 && !candidates.has(dollars)) candidates.set(dollars, { weight: 4, line: lines[i].trim() });
      continue;
    }
    const hit = amountAfter(lines, i, key[0]);
    if (!hit || !(hit.dollars > 0 && hit.dollars < 10_000)) continue;
    const weight = key[1] - hit.away * 0.5;
    const prev = candidates.get(hit.dollars);
    if (!prev || weight > prev.weight) candidates.set(hit.dollars, { weight, line: lines[i].trim() });
  }
  // Supply plus delivery is this period's charges, unless the bill adds other charges or credits;
  // it stands in when the labelled total was misread, but loses to a labelled one that differs.
  // (Two sections equal to the cent are one misread amount taken twice.)
  if (sections !== null && !sectionsEqual && !candidates.has(Math.round(sections * 100) / 100)) {
    candidates.set(Math.round(sections * 100) / 100, { weight: 4.5, line: "Supply and delivery totals added up" });
  }
  let best: { dollars: number; line: string; score: number } | null = null;
  for (const [dollars, c] of candidates) {
    // The bill can't be smaller than one of its own sections: that is a misread.
    if (floor !== null && dollars < floor - 0.01) continue;
    const repeats = all.filter((v) => Math.abs(v - dollars) < 0.005).length;
    const added = c.line === "Supply and delivery totals added up";
    const score = c.weight + Math.min(repeats, 4) * 0.4 + (!added && sections !== null && Math.abs(dollars - sections) < 0.03 ? 4 : 0);
    if (!best || score > best.score) best = { dollars, line: c.line, score };
  }
  return best ? { dollars: best.dollars, line: best.line } : null;
}

const SUPPLY_WORDS = /supply|supplier|generation|basic\s+(?:service|svc)|default\s+service/i;
/** Words that only name the supply charge itself; plain "supply" also labels summary lines. */
const SUPPLY_CHARGE_WORDS = /supplier|generation|basic\s+(?:service|svc)|default\s+service/i;
const DELIVERY_WORDS = /delivery|distribution|dist\s+chg|transmission|transition|c?ustomer\s+charge|efficiency|renewable|solar|net\s+meter|decoupling|vehicle/i;

/**
 * Supply rate. National Grid prints it rate first ("Basic Service Fixed 0.07314 x 659 kWh"),
 * Eversource quantity first with a bare rate ("Generation Service Charge 736 kWh X .14205"), others
 * as "@ $0.2041", "$0.1893/kWh" or "18.93 cents/kWh". A rate on a line that names supply or
 * generation beats one that only sits in the supply section; one that times the kWh gives the
 * supply total beats both. Without a printed rate, the charge on the supply line or the supply
 * total divided by kWh stands in, and last the bill's total less its delivery total; when such a
 * quotient agrees with a printed rate, the printed rate is the answer.
 */
function findSupplyRate(text: string, kwh: number | null, supplyTotal: number | null, notDelivery: number | null): { cents: number; line: string } | null {
  const patterns: [RegExp, number][] = [
    // OCR can drop the "kWh" after the quantity; "rate x quantity" is distinctive enough without it.
    [/(?<![\d.])\$?\s?(\d?\.\d{3,6})\s*[x×*]\s*(?:\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.\d{1,2})?(?!\d)/i, 100],
    [/kWh\s*(?:[x×*@]|at)\s*\$?\s?(\d?\.\d{3,6})(?!\d)/i, 100],
    [/@\s*\$?\s?(\d?\.\d{3,6})(?!\d)/, 100],
    [/\$?\s?(\d?\.\d{3,6})\s*(?:\/|per)\s*kWh/i, 100],
    [/(\d{1,2}\.\d{1,4})\s*(?:¢|cents?)\s*(?:\/|per)?\s*kWh/i, 1],
    // what is left of "736 kWh X .14205" when OCR loses the quantity
    [/(?:^|\s)[x×]\s*\$?\s?(\d?\.\d{3,6})(?!\d)/i, 100],
  ];
  const rateIn = (s: string): number | null => {
    for (const [re, scale] of patterns) {
      const m = re.exec(s);
      const v = m ? Number(m[1]) * scale : NaN;
      if (v >= 3 && v <= 60) return v;
    }
    return null;
  };
  // "0.15562 x 507 kWh 78.90": the line's own charge confirms the rate was read right.
  const checks = (s: string, cents: number) =>
    kwh !== null && [...s.matchAll(AMOUNTS)].some((m) => Math.abs(toNumber(m[1]) - (cents * kwh) / 100) <= 0.02);
  // A rate the bill prints on a delivery charge's line is a delivery rate wherever else it turns up
  // (a scrambled reading can leave it under the supply heading).
  const deliveryRates: number[] = [];
  for (const line of text.split("\n")) {
    if (!DELIVERY_WORDS.test(line) || SUPPLY_WORDS.test(line)) continue;
    const cents = rateIn(line);
    if (cents !== null) deliveryRates.push(cents);
  }
  const candidates: { cents: number; line: string; score: number; printed: boolean }[] = [];
  const consider = (cents: number, line: string, score: number, printed: boolean, fromSupplyTotal = false) => {
    if (cents < 3 || cents > 60 || deliveryRates.some((d) => Math.abs(d - cents) < 0.0005)) return;
    // Independent agreement with the supply total; the quotient of that total can't vouch for itself.
    if (!fromSupplyTotal && kwh && supplyTotal && Math.abs((cents * kwh) / 100 - supplyTotal) <= Math.max(0.05, supplyTotal * 0.01)) score += 3;
    candidates.push({ cents, line, score, printed });
  };
  // How sure we are that a bare rate line belongs to the supply charge: after a supplier or
  // generation line, more than after a line that only says "supply".
  let inSupply = 0;
  for (const line of text.split("\n")) {
    const at = line.search(SUPPLY_WORDS);
    if (at >= 0) {
      inSupply = SUPPLY_CHARGE_WORDS.test(line) ? 1 : 0.6;
      // Two columns can share a line; read from the supply words on.
      const tail = line.slice(at);
      const cents = rateIn(tail);
      if (cents !== null) consider(cents, line.trim(), checks(tail, cents) ? 3.5 : 2, true);
      else if (kwh && !/total|services/i.test(tail)) {
        const m = AMOUNT.exec(tail);
        if (m) consider((toNumber(m[1]) / kwh) * 100, line.trim(), 1.5, false);
      }
    } else if (DELIVERY_WORDS.test(line)) {
      inSupply = 0;
    } else if (inSupply) {
      const cents = rateIn(line);
      if (cents !== null) consider(cents, line.trim(), inSupply + (checks(line, cents) ? 0.5 : 0), true);
    }
  }
  if (supplyTotal && kwh) consider((supplyTotal / kwh) * 100, `Supply total ${supplyTotal.toFixed(2)} ÷ ${kwh} kWh`, 1.5, false, true);
  // Ahead of a rate that only sits in the supply section: a hard photo can lose the supply line and
  // leave a delivery rate under the supply heading.
  if (notDelivery && kwh) consider((notDelivery / kwh) * 100, `Total less delivery ${notDelivery.toFixed(2)} ÷ ${kwh} kWh`, 1.2, false);
  // Readings that agree back each other up.
  const agree = (a: number, b: number) => Math.abs(a - b) < 0.05;
  let best: (typeof candidates)[number] | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score = c.score + candidates.filter((o) => o !== c && agree(o.cents, c.cents)).length;
    if (score > bestScore || (score === bestScore && c.printed && !best!.printed)) {
      best = c;
      bestScore = score;
    }
  }
  if (best && !best.printed) best = candidates.find((c) => c.printed && agree(c.cents, best!.cents)) ?? best;
  return best ? { cents: best.cents, line: best.line } : null;
}

/** The issue date: "Statement Date: 08/08/24", "DATE BILL ISSUED Jan 28, 2013", "Issued on Feb 7, 2026". */
function findStatementDate(text: string): { date: string; line: string } | null {
  const key = /(?:statement|bill(?:ing)?|invoice)\s+date|date\s+(?:of\s+)?(?:bill|statement)|date\s+(?:issued|mailed)|issued\s+on/i;
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

/**
 * A section total: "Total Supply Services $ 48.20", "Subtotal Supplier Services $104.55",
 * "Electric Supply Services $104.55". The amount must follow the label on its line, or stand alone
 * on the next line: with two columns side by side, the next amount on the line can be another
 * section's charge.
 */
function findSectionTotal(text: string, key: RegExp): { dollars: number; line: string } | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].search(key) < 0) continue;
    const hit = amountAfter(lines, i, key, 1, true);
    if (hit && hit.dollars > 0 && hit.dollars < 10_000) return { dollars: hit.dollars, line: lines[i].trim() };
  }
  return null;
}

// ----------------------------------------------------------------------------- public

export function parseBillText(raw: string): ParsedBill {
  const text = realign(normalize(raw));
  const evidence: BillEvidence = {};

  const utility = findUtility(text);
  if (utility) evidence.utility = utility.line.trim();
  const statement = findStatementDate(text);
  if (statement) evidence.statementDate = statement.line;
  const period = findPeriod(text, statement?.date ?? null);
  if (period.line) {
    if (period.start) evidence.periodStart = period.line;
    if (period.end) evidence.periodEnd = period.line;
    evidence.days = period.daysLine ?? period.line;
  }
  const kwh = findKwh(text);
  if (kwh) evidence.kwh = kwh.line;
  let supplyTotal = findSectionTotal(text, /(?:sub)?total\s+(?:supply|supplier|generation)|supply\s+services|supplier\s+services/i);
  let deliveryTotal = findSectionTotal(text, /(?:sub)?total\s+delivery|delivery\s+services/i);
  const total = findTotal(
    text,
    supplyTotal && deliveryTotal ? supplyTotal.dollars + deliveryTotal.dollars : null,
    supplyTotal || deliveryTotal ? Math.max(supplyTotal?.dollars ?? 0, deliveryTotal?.dollars ?? 0) : null,
    supplyTotal !== null && supplyTotal.dollars === deliveryTotal?.dollars,
  );
  if (total) evidence.totalDollars = total.line;
  // Section totals that add up to more than the bill were read from the wrong column.
  if (supplyTotal && deliveryTotal && total && supplyTotal.dollars + deliveryTotal.dollars > total.dollars + 1) supplyTotal = deliveryTotal = null;
  const supply = findSupplyRate(
    text,
    kwh?.kwh ?? null,
    supplyTotal?.dollars ?? null,
    total && deliveryTotal && total.dollars > deliveryTotal.dollars ? total.dollars - deliveryTotal.dollars : null,
  );
  if (supply) evidence.supplyCents = supply.line;
  if (supplyTotal) evidence.supplyDollars = supplyTotal.line;
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

/**
 * One bill read more than once (OCR's second reading of a hard photo): what the first reading found
 * stands, and later readings only fill what it left empty, since a second reading finds more but can
 * also misread what the first got. The supply rate is the exception: it is chosen from every reading
 * together, where a rate printed in one reading and the supply charge read in another back each
 * other up, checked against the merged kWh and totals rather than one reading's share of them.
 */
export function parseBillReadings(texts: string[]): ParsedBill {
  const readings = texts.filter((t) => t.trim()).map(parseBillText);
  if (readings.length < 2) return readings[0] ?? parseBillText("");
  const fields = { ...readings[0].fields };
  const evidence = { ...readings[0].evidence };
  for (const r of readings.slice(1)) {
    for (const key of Object.keys(fields) as (keyof BillFields)[]) {
      if (fields[key] !== null || r.fields[key] === null) continue;
      Object.assign(fields, { [key]: r.fields[key] });
      if (r.evidence[key]) evidence[key] = r.evidence[key];
    }
  }
  {
    const { kwh, totalDollars: total, deliveryDollars: delivery } = fields;
    const supply = findSupplyRate(
      texts.map((t) => realign(normalize(t))).join("\n"),
      kwh,
      fields.supplyDollars,
      total !== null && delivery !== null && total > delivery ? total - delivery : null,
    );
    if (supply) {
      fields.supplyCents = Math.round(supply.cents * 1000) / 1000;
      evidence.supplyCents = supply.line;
    }
  }
  return { fields, evidence };
}

/** Whether a reading left any of the report's details empty. */
export function incomplete(p: ParsedBill): boolean {
  const f = p.fields;
  return f.utility === null || f.kwh === null || f.totalDollars === null || f.supplyCents === null || f.days === null || inferBillMonth(f) === null;
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
