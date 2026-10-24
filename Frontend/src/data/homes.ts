// "A home like yours": weighted RECS 2020 percentiles for the subset of Massachusetts homes that
// match the viewer's answers. Same weighted-percentile rule as the backend's bySqftBucket/byHeatFuel
// bands, extended to combinations — with a sample-size floor so a band never rests on a handful of
// homes. When a combination is too thin, the least important answers are relaxed and we say so.

import { sqftBucket, type RecsHome, type SqftBucket } from "./model.ts";
import { weightedPercentile } from "./stats.ts";

export interface HomeAnswers {
  sqft: SqftBucket | "any";
  type: number | "any";
  fuel: number | "any";
  members: number | "any"; // 5 means "5 or more"
}

export type AnswerKey = keyof HomeAnswers;

/** Relaxed in this order (last first): household size, then heating fuel, then home type. */
const PRIORITY: AnswerKey[] = ["sqft", "type", "fuel", "members"];

export const MIN_HOMES = 20;

function matches(h: RecsHome, a: HomeAnswers, keys: AnswerKey[]): boolean {
  return keys.every((k) => {
    const v = a[k];
    if (v === "any") return true;
    if (k === "sqft") return sqftBucket(h.sqft) === v;
    if (k === "type") return h.typeHuq === v;
    if (k === "fuel") return h.fuelHeat === v;
    return v === 5 ? h.members >= 5 : h.members === v;
  });
}

export interface HomeEstimate {
  n: number;
  p10: number;
  p50: number;
  p90: number;
  used: AnswerKey[];
  relaxed: AnswerKey[];
}

export function estimateHome(recs: RecsHome[], answers: HomeAnswers, minN = MIN_HOMES): HomeEstimate {
  const asked = PRIORITY.filter((k) => answers[k] !== "any");
  for (let keep = asked.length; keep >= 0; keep--) {
    const used = asked.slice(0, keep);
    const subset = recs.filter((h) => matches(h, answers, used));
    if (subset.length >= minN || keep === 0) {
      const items = subset.map((h) => ({ value: h.kwh, weight: h.weight }));
      return {
        n: subset.length,
        p10: weightedPercentile(items, 0.1),
        p50: weightedPercentile(items, 0.5),
        p90: weightedPercentile(items, 0.9),
        used,
        relaxed: asked.slice(keep),
      };
    }
  }
  throw new Error("unreachable");
}
