// Data prep for the regime nowcast panel (components/RegimeNowcast.tsx). Pure and JSX-free so node --test can
// check it; the drawing mirrors Backend/docs/img/examples/regime_nowcast_*.png.

import type { GridArea, GridColor, RangePoint } from "./model.ts";

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
