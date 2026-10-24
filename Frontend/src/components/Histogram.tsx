import { scaleLinear } from "d3-scale";
import { useState } from "react";

import { textWidth } from "./axes.ts";
import { barPath } from "./BarChart.tsx";
import { useWidth } from "./hooks.ts";
import { REGIME_META } from "./regime.tsx";
import { Tooltip } from "./ui.tsx";
import { fmtNum, fmtPct } from "../data/format.ts";

/**
 * Weighted distribution of annual kWh with the traffic-light bands as background washes (the cut
 * points are exact; bars stay one neutral colour so a bin straddling a cut isn't mis-coloured).
 */
export function KwhHistogram({
  bins,
  greenMax,
  greyMax,
  marker,
  height = 220,
  ariaLabel,
}: {
  bins: { x0: number; x1: number; share: number }[];
  greenMax: number;
  greyMax: number;
  marker?: { value: number; label: string };
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const maxShare = Math.max(...bins.map((b) => b.share));
  const y = scaleLinear().domain([0, maxShare]).nice(4);
  const yTicks = y.ticks(4);
  const left = Math.max(...yTicks.map((t) => textWidth(fmtPct(t)))) + 10;
  const top = 26;
  const bottom = 24;
  const innerW = Math.max(60, width - left - 8);
  const innerH = height - top - bottom;
  y.range([top + innerH, top]);
  const xMax = bins[bins.length - 1].x1;
  const x = scaleLinear().domain([0, xMax]).range([left, left + innerW]);
  const xTicks = x.ticks(Math.max(3, Math.floor(innerW / 70)));
  const bandWashes = [
    { from: 0, to: greenMax, regime: "low" as const },
    { from: greenMax, to: greyMax, regime: "mid" as const },
    { from: greyMax, to: xMax, regime: "high" as const },
  ];

  return (
    <div className="chart" ref={ref} role="group" aria-roledescription="chart" aria-label={ariaLabel}>
      <svg width={width} height={height}>
        {bandWashes.map((b) => (
          <g key={b.regime}>
            <rect x={x(b.from)} y={top} width={Math.max(0, x(Math.min(b.to, xMax)) - x(b.from))} height={innerH} style={{ fill: REGIME_META[b.regime].wash }} />
            <text className="ref-label" x={(x(b.from) + x(Math.min(b.to, xMax))) / 2} y={top - 8} textAnchor="middle">
              {REGIME_META[b.regime].label}
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "base-line" : "grid-line"} x1={left} x2={left + innerW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
            <text className="axis-text" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {fmtPct(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} className="axis-text" x={x(t)} y={top + innerH + 16} textAnchor="middle">
            {t === 0 ? "0" : `${fmtNum(t / 1000)}k`}
          </text>
        ))}
        {[greenMax, greyMax].map((v) => (
          <line key={v} x1={Math.round(x(v)) + 0.5} x2={Math.round(x(v)) + 0.5} y1={top} y2={top + innerH} style={{ stroke: "var(--baseline)" }} />
        ))}
        {bins.map((b, i) => {
          const x0 = x(b.x0) + 1;
          const w = Math.max(1, x(b.x1) - x(b.x0) - 2);
          return (
            <g key={b.x0} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onPointerDown={() => setActive(i)}>
              <rect x={x(b.x0)} y={top} width={x(b.x1) - x(b.x0)} height={innerH} fill="transparent" />
              <path d={barPath(x0, y(b.share), w, y(0) - y(b.share), "top", Math.min(4, w / 2))} style={{ fill: "var(--series-1)" }} opacity={active === null || active === i ? 0.85 : 0.45} />
            </g>
          );
        })}
        {marker ? (
          <g pointerEvents="none">
            <line x1={x(Math.min(marker.value, xMax))} x2={x(Math.min(marker.value, xMax))} y1={top - 2} y2={top + innerH} style={{ stroke: "var(--ink)" }} strokeWidth={2} />
            <circle cx={x(Math.min(marker.value, xMax))} cy={top + 2} r={4} style={{ fill: "var(--ink)", stroke: "var(--surface)" }} strokeWidth={2} />
            <text className="direct-label-strong" x={x(Math.min(marker.value, xMax)) + (x(marker.value) > left + innerW * 0.75 ? -8 : 8)} y={top + 14} textAnchor={x(marker.value) > left + innerW * 0.75 ? "end" : "start"}>
              {marker.label}
            </text>
          </g>
        ) : null}
      </svg>
      {active !== null ? (
        <Tooltip
          x={x((bins[active].x0 + bins[active].x1) / 2)}
          y={top}
          containerWidth={width}
          title={`${fmtNum(bins[active].x0)}–${fmtNum(bins[active].x1)} kWh / yr${active === bins.length - 1 ? " and above" : ""}`}
          rows={[{ key: "rect", color: "var(--series-1)", value: fmtPct(bins[active].share, 1), label: "of MA homes (weighted)" }]}
        />
      ) : null}
    </div>
  );
}
