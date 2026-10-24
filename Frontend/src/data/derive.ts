// Aggregates the dashboard shows on top of the raw EIA series. Prices are always revenue / sales
// over the period (never an average of monthly prices), which is how EIA itself reports them.

import type { EiaMonth } from "./model.ts";

export interface Period {
  from: string;
  to: string;
  months: number;
  priceCents: number;
  salesGwh: number;
  avgCustomers: number;
  kwhPerAccount: number;
  preliminary: boolean;
}

export function summarize(rows: EiaMonth[]): Period {
  const revenue = rows.reduce((s, r) => s + r.revenueKusd, 0);
  const sales = rows.reduce((s, r) => s + r.salesMwh, 0);
  const customers = rows.reduce((s, r) => s + r.customers, 0) / rows.length;
  return {
    from: rows[0].ym,
    to: rows[rows.length - 1].ym,
    months: rows.length,
    priceCents: (revenue / sales) * 100,
    salesGwh: sales / 1000,
    avgCustomers: customers,
    kwhPerAccount: (sales * 1000) / customers,
    preliminary: rows.some((r) => r.preliminary),
  };
}

/** Trailing twelve months ending `offset` months before the newest month. */
export function trailing12(eia: EiaMonth[], offset = 0): Period {
  const end = eia.length - offset;
  if (end < 12) throw new Error("not enough months for a trailing year");
  return summarize(eia.slice(end - 12, end));
}

/** Complete calendar years only (a partial final year is reported separately as year-to-date). */
export function calendarYears(eia: EiaMonth[]): (Period & { year: number })[] {
  const byYear = new Map<number, EiaMonth[]>();
  for (const r of eia) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r]);
  return [...byYear.entries()].filter(([, rows]) => rows.length === 12).map(([year, rows]) => ({ year, ...summarize(rows) }));
}

export const RANGES = ["all", "10y", "5y", "24m"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABEL: Record<Range, string> = { all: "All", "10y": "10 years", "5y": "5 years", "24m": "24 months" };
const RANGE_MONTHS: Record<Range, number> = { all: Infinity, "10y": 120, "5y": 60, "24m": 24 };

/** The last N items of a monthly series for a range preset. */
export function sliceRange<T>(items: T[], range: Range): T[] {
  const n = RANGE_MONTHS[range];
  return Number.isFinite(n) ? items.slice(Math.max(0, items.length - n)) : items;
}
