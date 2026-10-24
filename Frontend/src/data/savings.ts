// "Money you could have saved" vs basic service — a line-for-line port of
// Backend/src/backend/savings_model.py so the calculator and savings_model.json always agree.
//
//   userMonthly[m]    = userRateCents     * kWh[m] / 100   (what the household paid, supply only)
//   defaultMonthly[m] = basicServiceCents * kWh[m] / 100   (what basic service would have cost)
//   savedMonthly[m]   = defaultMonthly[m] - userMonthly[m] (+ = saved, - = overpaid)

import { addMonths, moneyDisplay, ymIndex } from "./format.ts";
import { UTILITY_IDS, type FixedRow, type UtilityId } from "./model.ts";

export interface TermSpan {
  start: string;
  end: string;
  cents: number;
}

/**
 * Per-utility basic-service fixed terms. A rate sits on its term's last month; a term starts the
 * month after the previous term ended. The first known term covers only its own end month.
 */
export function termSpans(rows: FixedRow[]): Record<UtilityId, TermSpan[]> {
  const out = {} as Record<UtilityId, TermSpan[]>;
  for (const u of UTILITY_IDS) {
    const ends = rows
      .filter((r) => r.cents[u] !== null)
      .map((r) => ({ end: r.termEnd, cents: r.cents[u] as number }))
      .sort((a, b) => ymIndex(a.end) - ymIndex(b.end) || a.cents - b.cents);
    let prev: string | null = null;
    out[u] = ends.map(({ end, cents }) => {
      const start: string = prev === null ? end : addMonths(prev, 1);
      prev = end;
      return { start, end, cents };
    });
  }
  return out;
}

/** The fixed rate whose term covers `ym`, or null when no term does. */
export function basicServiceCents(spans: Record<UtilityId, TermSpan[]>, utility: UtilityId, ym: string): number | null {
  const k = ymIndex(ym);
  for (const s of spans[utility]) {
    if (ymIndex(s.start) <= k && k <= ymIndex(s.end)) return s.cents;
  }
  return null;
}

/** The longest run of consecutive covered months ending at the newest term. */
export function coveredWindow(spans: Record<UtilityId, TermSpan[]>, utility: UtilityId): { first: string; last: string } {
  const s = spans[utility];
  let i = s.length - 1;
  while (i > 0 && ymIndex(s[i - 1].end) + 1 === ymIndex(s[i].start)) i--;
  return { first: s[i].start, last: s[s.length - 1].end };
}

export interface SavingsInput {
  utility: UtilityId;
  userRateCents: number;
  startYm: string;
  kwhByMonth: number[];
}

export interface SavingsResult {
  utility: UtilityId;
  userRateCents: number;
  months: string[];
  kwhByMonth: number[];
  basicServiceCentsByMonth: number[];
  userMonthly: number[];
  defaultMonthly: number[];
  savedMonthly: number[];
  savedMonthlyDisplay: string[];
  savedTotal: number;
  savedTotalDisplay: string;
}

export function computeSavings(spans: Record<UtilityId, TermSpan[]>, input: SavingsInput): SavingsResult {
  const { utility, userRateCents, startYm, kwhByMonth } = input;
  if (!UTILITY_IDS.includes(utility)) throw new Error(`unknown utility ${utility}`);
  if (kwhByMonth.length === 0) throw new Error("need at least one month");
  if (!Number.isFinite(userRateCents) || userRateCents < 0) throw new Error("rate must be a non-negative number");
  ymIndex(startYm); // validates YYYY-MM

  const months: string[] = [];
  const basic: number[] = [];
  const userMonthly: number[] = [];
  const defaultMonthly: number[] = [];
  const savedMonthly: number[] = [];
  kwhByMonth.forEach((kwh, i) => {
    if (!Number.isFinite(kwh) || kwh < 0) throw new Error("kWh must be a non-negative number");
    const m = addMonths(startYm, i);
    const b = basicServiceCents(spans, utility, m);
    if (b === null) throw new Error(`no basic-service term covers ${utility} ${m}`);
    const um = (userRateCents * kwh) / 100;
    const dm = (b * kwh) / 100;
    months.push(m);
    basic.push(b);
    userMonthly.push(um);
    defaultMonthly.push(dm);
    savedMonthly.push(dm - um);
  });
  const savedTotal = pySum(savedMonthly);
  return {
    utility,
    userRateCents,
    months,
    kwhByMonth: [...kwhByMonth],
    basicServiceCentsByMonth: basic,
    userMonthly,
    defaultMonthly,
    savedMonthly,
    savedMonthlyDisplay: savedMonthly.map(moneyDisplay),
    savedTotal,
    savedTotalDisplay: moneyDisplay(savedTotal),
  };
}

/**
 * Python 3.12+ `sum()` over floats: Neumaier-compensated, so -187.785 stays -187.785 instead of
 * drifting to -187.78500000000003. Keeps savedTotal bit-identical to the backend.
 */
export function pySum(values: number[]): number {
  let total = 0;
  let c = 0;
  for (const x of values) {
    const t = total + x;
    c += Math.abs(total) >= Math.abs(x) ? total - t + x : x - t + total;
    total = t;
  }
  return c !== 0 && Number.isFinite(c) ? total + c : total;
}

/** Spread an annual kWh figure over months with the statewide seasonal shares (Jan..Dec). */
export function seasonalKwh(annualKwh: number, shares: number[], startYm: string, months: number): number[] {
  return Array.from({ length: months }, (_, i) => annualKwh * shares[ymIndex(addMonths(startYm, i)) % 12]);
}
