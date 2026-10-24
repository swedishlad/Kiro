import { scaleLinear } from "d3-scale";
import { useMemo, useState, type PointerEvent, type ReactNode } from "react";

import { textWidth } from "./axes.ts";
import { useWidth } from "./hooks.ts";
import { REGIME_META, regimePath, type Regime } from "./regime.tsx";
import { Tooltip, type TooltipRow } from "./ui.tsx";

export interface ScatterPoint {
  x: number;
  y: number;
  regime: Regime | null;
}

/**
 * Dense scatter (≈1,800 days). Shape + colour both carry the regime; hover uses a nearest-point
 * search within 24px so nobody has to land on a 7px mark dead-centre.
 */
export function RegimeScatter({
  points,
  xFormat,
  yFormat,
  xTitle,
  yTitle,
  height = 320,
  titleFor,
  rowsFor,
  ariaLabel,
}: {
  points: ScatterPoint[];
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  xTitle: string;
  yTitle: string;
  height?: number;
  titleFor: (i: number) => ReactNode;
  rowsFor: (i: number) => TooltipRow[];
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const g = useMemo(() => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).nice(6);
    const y = scaleLinear().domain([Math.min(...ys), Math.max(...ys)]).nice(5);
    const yTicks = y.ticks(5);
    const left = Math.max(...yTicks.map((t) => textWidth(yFormat(t)))) + 12;
    const top = 18;
    const bottom = 40;
    const innerW = Math.max(60, width - left - 10);
    const innerH = height - top - bottom;
    x.range([left, left + innerW]);
    y.range([top + innerH, top]);
    const px = points.map((p) => [x(p.x), y(p.y)] as const);
    return { x, y, yTicks, xTicks: x.ticks(Math.max(3, Math.floor(innerW / 70))), left, top, innerW, innerH, px };
  }, [points, width, height, yFormat]);

  const { x, y, yTicks, xTicks, left, top, innerW, innerH, px } = g;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = -1;
    let bestD = 24 * 24;
    for (let i = 0; i < px.length; i++) {
      const dx = px[i][0] - mx;
      const dy = px[i][1] - my;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setActive(best >= 0 ? best : null);
  };

  // Draw the most common regime first so the rarer ones stay visible on top.
  const order: (Regime | null)[] = [null, "mid", "low", "high"];

  return (
    <div className="chart" ref={ref} role="group" aria-roledescription="chart" aria-label={ariaLabel}>
      <svg width={width} height={height}>
        {yTicks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={left} x2={left + innerW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
            <text className="axis-text" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={Math.round(x(t)) + 0.5} x2={Math.round(x(t)) + 0.5} y1={top} y2={top + innerH} />
            <text className="axis-text" x={x(t)} y={top + innerH + 16} textAnchor="middle">
              {xFormat(t)}
            </text>
          </g>
        ))}
        <text className="axis-title" x={left + innerW / 2} y={height - 4} textAnchor="middle">
          {xTitle}
        </text>
        <text className="axis-title" x={left} y={10}>
          {yTitle}
        </text>
        {order.map((r) => (
          <g key={r ?? "none"}>
            {points.map((p, i) =>
              p.regime === r ? (
                <path
                  key={i}
                  transform={`translate(${px[i][0].toFixed(1)},${px[i][1].toFixed(1)})`}
                  d={regimePath(r ?? "mid", 3.6)}
                  style={{ fill: r ? REGIME_META[r].color : "var(--muted-series)" }}
                  opacity={active === null ? 0.72 : 0.35}
                />
              ) : null,
            )}
          </g>
        ))}
        {active !== null ? (
          <path
            transform={`translate(${px[active][0]},${px[active][1]})`}
            d={regimePath(points[active].regime ?? "mid", 6)}
            style={{ fill: points[active].regime ? REGIME_META[points[active].regime!].color : "var(--muted-series)", stroke: "var(--surface)" }}
            strokeWidth={2}
            pointerEvents="none"
          />
        ) : null}
        <rect x={left} y={top} width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActive(null)} />
      </svg>
      {active !== null ? <Tooltip x={px[active][0]} y={px[active][1] - 20} containerWidth={width} title={titleFor(active)} rows={rowsFor(active)} /> : null}
    </div>
  );
}
