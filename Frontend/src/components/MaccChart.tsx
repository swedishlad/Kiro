import { scaleLinear } from "d3-scale";
import { useMemo, useState, type KeyboardEvent } from "react";

import { textWidth } from "./axes.ts";
import { barPath } from "./BarChart.tsx";
import { useWidth } from "./hooks.ts";
import { Tooltip, type TooltipRow } from "./ui.tsx";

export interface MaccBar {
  label: string;
  /** net cost per ton avoided; negative = the action saves more than it costs */
  costPerTon: number;
  tonsPerYear: number;
  rows?: TooltipRow[];
}

/**
 * Marginal abatement cost curve: bars sit side by side, cheapest first, each as wide as the tons it
 * avoids a year and as tall as its net cost per ton. Below the zero line pays for itself.
 * Bars carry their rank number above the bar (or above the zero line when they hang below it); the
 * list under the chart names them.
 */
export function MaccChart({
  bars,
  height = 260,
  costFormat,
  tonsFormat,
  ariaLabel,
}: {
  bars: MaccBar[];
  height?: number;
  costFormat: (v: number) => string;
  tonsFormat: (v: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const g = useMemo(() => {
    const costs = bars.map((b) => b.costPerTon);
    const lo = Math.min(0, ...costs);
    const hi = Math.max(0, ...costs);
    const y = scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).nice(5);
    const ticks = y.ticks(5);
    const left = Math.max(...ticks.map((t) => textWidth(costFormat(t)))) + 10;
    const top = 20;
    const bottom = 40;
    const innerW = Math.max(40, width - left - 8);
    const innerH = height - top - bottom;
    y.range([top + innerH, top]);
    const total = bars.reduce((s, b) => s + b.tonsPerYear, 0);
    const x = scaleLinear().domain([0, total || 1]).range([left, left + innerW]);
    const xTicks = x.ticks(Math.max(2, Math.floor(innerW / 80)));
    let cum = 0;
    const spans = bars.map((b) => {
      const x0 = x(cum);
      cum += b.tonsPerYear;
      return { x0, x1: x(cum) };
    });
    return { y, ticks, left, top, innerW, innerH, x, xTicks, spans };
  }, [bars, costFormat, width, height]);

  const { y, ticks, left, top, innerW, innerH, x, xTicks, spans } = g;
  const y0 = y(0);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const d = e.key === "ArrowRight" ? 1 : -1;
    setActive((a) => Math.max(0, Math.min(bars.length - 1, (a ?? (d > 0 ? -1 : bars.length)) + d)));
  };

  return (
    <div className="chart" ref={ref} tabIndex={0} role="group" aria-roledescription="chart" aria-label={`${ariaLabel}. Use arrow keys to read values.`} onKeyDown={onKey} onBlur={() => setActive(null)}>
      <svg width={width} height={height}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "base-line" : "grid-line"} x1={left} x2={left + innerW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
            <text className="axis-text" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {costFormat(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} className="axis-text" x={x(t)} y={top + innerH + 16} textAnchor="middle">
            {tonsFormat(t)}
          </text>
        ))}
        <text className="axis-text" x={left + innerW} y={top + innerH + 32} textAnchor="end">
          t CO₂e avoided a year, cumulative →
        </text>
        {bars.map((b, i) => {
          const { x0, x1 } = spans[i];
          const w = Math.max(1, x1 - x0 - (x1 - x0 > 6 ? 2 : 0));
          const yv = y(b.costPerTon);
          const h = Math.abs(yv - y0);
          const d = b.costPerTon >= 0 ? barPath(x0, yv, w, h, "top") : barPath(x0, y0, w, h, "bottom");
          const color = b.costPerTon < 0 ? "var(--series-1)" : "var(--series-2)";
          return (
            <g key={b.label} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onPointerDown={() => setActive(i)}>
              <rect x={x0} y={top} width={Math.max(1, x1 - x0)} height={innerH} fill="transparent" />
              <path d={d} style={{ fill: color }} opacity={active === null || active === i ? 1 : 0.55} className="mark-hover" />
              <text className="direct-label-strong" x={x0 + w / 2} y={(b.costPerTon >= 0 ? yv : y0) - 6} textAnchor="middle">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      {active !== null ? (
        <Tooltip
          x={(spans[active].x0 + spans[active].x1) / 2}
          y={top}
          containerWidth={width}
          title={`${active + 1}. ${bars[active].label}`}
          rows={
            bars[active].rows ?? [
              { key: "rect", color: bars[active].costPerTon < 0 ? "var(--series-1)" : "var(--series-2)", value: costFormat(bars[active].costPerTon), label: "per ton avoided" },
              { value: tonsFormat(bars[active].tonsPerYear), label: "t CO₂e a year" },
            ]
          }
        />
      ) : null}
    </div>
  );
}
