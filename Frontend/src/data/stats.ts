// Weighted statistics over the RECS 2020 sample, mirroring Backend/src/backend/data_sources.py.

export interface Weighted {
  value: number;
  weight: number;
}

/**
 * Backend `weighted_percentile`: sort by value, return the first value whose cumulative weight
 * reaches p * total. p is a fraction in [0, 1].
 */
export function weightedPercentile(items: Weighted[], p: number): number {
  if (items.length === 0) throw new Error("weightedPercentile needs at least one value");
  if (p < 0 || p > 1) throw new Error(`p must be in [0, 1], got ${p}`);
  const sorted = [...items].sort((a, b) => a.value - b.value || a.weight - b.weight);
  const total = sorted.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) throw new Error("sum of weights must be positive");
  const threshold = total * p;
  let acc = 0;
  for (const x of sorted) {
    acc += x.weight;
    if (acc >= threshold) return x.value;
  }
  return sorted[sorted.length - 1].value;
}

/** Share of weight at or below `value` — "you use more than X% of similar homes". */
export function weightedShareAtOrBelow(items: Weighted[], value: number): number {
  const total = items.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) throw new Error("sum of weights must be positive");
  const below = items.reduce((s, x) => (x.value <= value ? s + x.weight : s), 0);
  return below / total;
}

export type Level = "GREEN" | "GREY" | "RED";

/** Backend map_consumption.classify: GREEN <= greenMax < GREY <= greyMax < RED. */
export function classify(kwh: number, greenMax: number, greyMax: number): Level {
  if (kwh <= greenMax) return "GREEN";
  if (kwh <= greyMax) return "GREY";
  return "RED";
}

/** Equal-width histogram with weights; returns bin edges and weighted shares. */
export function weightedHistogram(items: Weighted[], edges: number[]): { x0: number; x1: number; share: number }[] {
  const total = items.reduce((s, x) => s + x.weight, 0);
  const bins = edges.slice(0, -1).map((x0, i) => ({ x0, x1: edges[i + 1], share: 0 }));
  for (const it of items) {
    let i = bins.findIndex((b) => it.value >= b.x0 && it.value < b.x1);
    if (i < 0 && it.value >= edges[edges.length - 1]) i = bins.length - 1; // fold the tail into the last bin
    if (i >= 0) bins[i].share += it.weight / total;
  }
  return bins;
}
