// The traffic-light vocabulary shared by every regime view. Colour always travels with a shape and
// a word: ▼ green · ● grey · ▲ red. Two backend models use it, so the words differ:
//   level  (hmm_regimes.json) — how high use is:            Low / Mid / High
//   range  (regimes.json)     — use vs its usual range:     Below / Within / Above range

import type { GridColor, RegimeName } from "../data/model.ts";

export type Regime = "low" | "mid" | "high";

export const REGIMES: Regime[] = ["low", "mid", "high"];

export type RegimeLabels = Record<Regime, string>;

export const LEVEL_LABELS: RegimeLabels = { low: "Low", mid: "Mid", high: "High" };
export const RANGE_LABELS: RegimeLabels = { low: "Below range", mid: "Within range", high: "Above range" };
/** compact forms for tight spots (inside stacked bars, tooltips) */
export const RANGE_SHORT: RegimeLabels = { low: "Below", mid: "Within", high: "Above" };

export const REGIME_META: Record<Regime, { color: string; wash: string }> = {
  low: { color: "var(--low)", wash: "var(--low-wash)" },
  mid: { color: "var(--mid)", wash: "var(--surface-2)" },
  high: { color: "var(--high)", wash: "var(--high-wash)" },
};

export const fromHmm = (r: RegimeName): Regime => (r === "GREEN" ? "low" : r === "GREY" ? "mid" : "high");
export const fromGrid = (c: GridColor): Regime => (c === "green" ? "low" : c === "grey" ? "mid" : "high");
export const fromLevel = fromHmm;

/** Shape path centred on (0,0) with "radius" r — used in SVG charts and in HTML badges alike. */
export function regimePath(regime: Regime, r: number): string {
  if (regime === "low") return `M${-r},${-r * 0.75} L${r},${-r * 0.75} L0,${r} Z`;
  if (regime === "high") return `M${-r},${r * 0.75} L${r},${r * 0.75} L0,${-r} Z`;
  return `M${r},0 A${r},${r} 0 1,1 ${-r},0 A${r},${r} 0 1,1 ${r},0 Z`;
}

export function RegimeIcon({ regime, size = 12 }: { regime: Regime; size?: number }) {
  const r = size / 2 - 1;
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true">
      <path d={regimePath(regime, r)} style={{ fill: REGIME_META[regime].color }} />
    </svg>
  );
}

export function RegimeBadge({
  regime,
  labels = LEVEL_LABELS,
  suffix,
  large,
}: {
  regime: Regime;
  labels?: RegimeLabels;
  suffix?: string;
  large?: boolean;
}) {
  return (
    <span className={`badge${large ? " badge-lg" : ""}`}>
      <RegimeIcon regime={regime} size={large ? 14 : 12} />
      {labels[regime]}
      {suffix ? <span style={{ fontWeight: 400, color: "var(--ink-2)" }}>{suffix}</span> : null}
    </span>
  );
}

export function RegimeLegend({ labels = LEVEL_LABELS }: { labels?: Partial<RegimeLabels> }) {
  return (
    <div className="legend" role="list">
      {REGIMES.map((r) => (
        <span className="legend-item" role="listitem" key={r}>
          <RegimeIcon regime={r} />
          {labels[r] ?? LEVEL_LABELS[r]}
        </span>
      ))}
    </div>
  );
}
