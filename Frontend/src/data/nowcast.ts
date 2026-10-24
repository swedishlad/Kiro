// Data prep for the regime nowcast panel (components/RegimeNowcast.tsx). Pure and JSX-free so node --test can
// check it; the drawing mirrors Backend/docs/img/examples/regime_nowcast_*.png.

import type { EiaMonth, GridArea, GridColor, RangePoint } from "./model.ts";

/** sd range drawn on the top panel; points beyond it are pinned to the edge (the tooltip shows the true value) */
export const Z_LIM = 4;
/** bottom → top of the probability stack, and the order of every probs array */
export const STACK: GridColor[] = ["green", "grey", "red"];

export interface NowPoint {
  date: string;
  color: GridColor;
  /** sd from the historical average: pctVsAverage / bandPct (the band is ±1 sd) */
  sd: number;
  /** sd clipped to ±Z_LIM, for drawing */
  z: number;
  pct: number;
  band: number;
  /** filtered P(below, within, above) */
  probs: [number, number, number];
}

export interface NowForecast {
  ym: string;
  color: GridColor;
  probs: [number, number, number];
  /** true = the tested gap model made this call; false = long-run odds (drawn hatched) */
  model: boolean;
  skill: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function triple(p: number[] | undefined, color: GridColor): [number, number, number] {
  if (p && p.length === 3) return [p[0], p[1], p[2]];
  return STACK.map((c) => (c === color ? 1 : 0)) as [number, number, number];
}

export function nowPoints(timeline: RangePoint[]): NowPoint[] {
  return timeline.map((t) => {
    const sd = t.bandPct > 0 ? t.pctVsAverage / t.bandPct : 0;
    return { date: t.date, color: t.color, sd, z: clamp(sd, -Z_LIM, Z_LIM), pct: t.pctVsAverage, band: t.bandPct, probs: triple(t.probs, t.color) };
  });
}

/** Median half-width of the range in %, to say what the state means (in sd) are in % of use. */
export function pctPerSd(timeline: RangePoint[]): number {
  const b = timeline.map((t) => t.bandPct).sort((x, y) => x - y);
  if (!b.length) return 0;
  const m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}

export function forecastBars(a: GridArea): NowForecast[] {
  return (a.forecast ?? []).map((f) => ({
    ym: f.date.slice(0, 7),
    color: f.color,
    probs: triple(f.probs, f.color),
    model: f.method === "ar1-gap",
    skill: f.skillVsLongRunMix,
  }));
}

/** The months the tested model forecasts lead the "next:" line; the rest are long-run odds. */
export function nextLine(fc: NowForecast[]): { model: NowForecast[]; longRun: number } {
  return { model: fc.filter((f) => f.model), longRun: fc.filter((f) => !f.model).length };
}

/** Largest filtered probability and its state: the "now: RED (60%)" headline. */
export function headline(a: GridArea): { color: GridColor; p: number } {
  const p = triple(a.current.probs, a.current.color);
  const k = p.indexOf(Math.max(...p));
  return { color: STACK[k], p: p[k] };
}

/** The "detailed" panels: the classified value against its usual range, and the change vs a year earlier. */
export interface DetailContext {
  /** homes: kWh per account (sales / 12-month mean of accounts); grid: GWh that day. Exactly what the model classifies */
  value: (number | null)[];
  /** usual range = the average of the same period in the previous 5 years, ± 1 sd */
  avg: (number | null)[];
  lo: (number | null)[];
  hi: (number | null)[];
  /** fraction vs a year earlier: homes = residential sales (accounts are noisy); grid = 7-day load, same weekdays */
  yoy: (number | null)[];
  preliminary: boolean[];
  unit: "kWh" | "GWh";
  valueTitle: string;
  yoyTitle: string;
  /** tooltip label after the value, e.g. "per account" */
  valueLabel: string;
  yoyLabel: string;
}

function ranges(timeline: RangePoint[], value: (number | null)[]) {
  const avg = value.map((v, k) => (v === null ? null : v / (1 + timeline[k].pctVsAverage / 100)));
  return {
    avg,
    lo: avg.map((m, k) => (m === null ? null : m * (1 - timeline[k].bandPct / 100))),
    hi: avg.map((m, k) => (m === null ? null : m * (1 + timeline[k].bandPct / 100))),
  };
}

/**
 * Homes: monthly use per account and residential sales vs the same month a year earlier. The usual range comes from
 * the regimes file itself (average = value / (1 + % vs average)), so the band and the regime colours cannot disagree;
 * nowcast.test.ts checks the site's own 5-year average reproduces it.
 */
export function homesContext(timeline: RangePoint[], eia: EiaMonth[], perAccount: (number | null)[]): DetailContext {
  const at = new Map(eia.map((m, i) => [m.ym, i]));
  const rows = timeline.map((t) => at.get(t.date.slice(0, 7)));
  const value = rows.map((i) => (i === undefined ? null : perAccount[i]));
  const yoy = timeline.map((t, k) => {
    const i = rows[k];
    const prior = at.get(`${Number(t.date.slice(0, 4)) - 1}${t.date.slice(4, 7)}`);
    return i === undefined || prior === undefined ? null : eia[i].salesMwh / eia[prior].salesMwh - 1;
  });
  return {
    value,
    ...ranges(timeline, value),
    yoy,
    preliminary: rows.map((i) => i !== undefined && eia[i].preliminary),
    unit: "kWh",
    valueTitle: "monthly use per residential account, kWh · shaded = usual range",
    yoyTitle: "residential sales vs a year earlier",
    valueLabel: "per account",
    yoyLabel: "sales vs a year earlier",
  };
}

/** Grid zones: daily load against its usual range and the 7-day load vs the same 7 days a year earlier. */
export function gridContext(timeline: RangePoint[]): DetailContext {
  const value = timeline.map((t) => (t.value === undefined ? null : t.value));
  return {
    value,
    ...ranges(timeline, value),
    yoy: timeline.map((t) => (t.yoyPct === undefined ? null : t.yoyPct / 100)),
    preliminary: timeline.map(() => false),
    unit: "GWh",
    valueTitle: "daily load, GWh · shaded = usual range",
    yoyTitle: "7-day load vs a year earlier",
    valueLabel: "that day",
    yoyLabel: "7-day load vs a year earlier",
  };
}

/** Full calendar months of a daily timeline, summed (GWh per month): the fan chart's actual history. */
export function monthlyTotals(timeline: RangePoint[]): { ym: string; gwh: number }[] {
  const byYm = new Map<string, { sum: number; n: number }>();
  for (const t of timeline) {
    if (t.value === undefined) continue;
    const ym = t.date.slice(0, 7);
    const m = byYm.get(ym) ?? { sum: 0, n: 0 };
    m.sum += t.value;
    m.n += 1;
    byYm.set(ym, m);
  }
  return [...byYm.entries()]
    .filter(([ym, m]) => m.n === new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate())
    .map(([ym, m]) => ({ ym, gwh: m.sum }));
}
