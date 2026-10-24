import { scaleLinear } from "d3-scale";
import { useState } from "react";

import { textWidth } from "./axes.ts";
import { useWidth } from "./hooks.ts";
import { Tooltip } from "./ui.tsx";

export interface RangeRow {
  label: string;
  sub?: string;
  p10: number;
  p50: number;
  p90: number;
  highlight?: boolean;
}

/**
 * P10–P90 range per row with the P50 as a dot: "most homes like this fall in this band".
 * Shared x-axis so rows compare directly.
 */
export function RangeChart({
  rows,
  format,
  axisFormat,
  ariaLabel,
  marker,
  domainMax,
  labelWidth,
}: {
  rows: RangeRow[];
  format: (v: number) => string;
  axisFormat: (v: number) => string;
  ariaLabel: string;
  marker?: { value: number; label: string };
  domainMax?: number;
  /** fixed label column, so stacked range charts share one x-axis */
  labelWidth?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const labelW = labelWidth ?? Math.min(180, Math.max(...rows.map((r) => textWidth(r.label, 12))) + 14);
  const right = 16;
  const innerW = Math.max(60, width - labelW - right);
  const max = domainMax ?? Math.max(...rows.map((r) => r.p90), marker?.value ?? 0);
  const x = scaleLinear().domain([0, max]).nice(5).range([labelW, labelW + innerW]);
  const ticks = x.ticks(5);
  const rowH = rows.some((r) => r.sub) ? 44 : 34;
  const top = marker ? 18 : 6;
  const height = top + rows.length * rowH + 22;

  return (
    <div className="chart" ref={ref} role="group" aria-roledescription="chart" aria-label={`${ariaLabel}: ${rows.map((r) => `${r.label} median ${format(r.p50)}, typical range ${format(r.p10)} to ${format(r.p90)}`).join("; ")}`}>
      <svg width={width} height={height}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "base-line" : "grid-line"} x1={Math.round(x(t)) + 0.5} x2={Math.round(x(t)) + 0.5} y1={top} y2={height - 20} />
            <text className="axis-text" x={x(t)} y={height - 6} textAnchor="middle">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {marker ? (
          <g>
            <line x1={x(marker.value)} x2={x(marker.value)} y1={top - 4} y2={height - 20} style={{ stroke: "var(--ink)" }} strokeWidth={1.5} />
            <text className="direct-label-strong" x={x(marker.value)} y={top - 8} textAnchor={x(marker.value) > labelW + innerW * 0.8 ? "end" : "middle"}>
              {marker.label}
            </text>
          </g>
        ) : null}
        {rows.map((r, i) => {
          const cy = top + i * rowH + rowH / 2 - (r.sub ? 5 : 0);
          const color = r.highlight === false ? "var(--muted-series)" : "var(--series-1)";
          return (
            <g key={r.label} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onPointerDown={() => setActive(i)}>
              <rect x={0} y={top + i * rowH} width={width} height={rowH} fill="transparent" />
              <text className="direct-label" x={0} y={cy} dy="0.32em" style={{ fill: "var(--ink)" }}>
                {r.label}
              </text>
              {r.sub ? (
                <text className="axis-text" x={0} y={cy + 15} dy="0.32em">
                  {r.sub}
                </text>
              ) : null}
              <rect x={x(r.p10)} y={cy - 4} width={Math.max(2, x(r.p90) - x(r.p10))} height={8} rx={4} style={{ fill: color }} opacity={0.3} />
              <circle cx={x(r.p50)} cy={cy} r={6} style={{ fill: color, stroke: "var(--surface)" }} strokeWidth={2} />
              <text className="axis-text" x={x(r.p50)} y={cy - 12} textAnchor="middle" style={{ fill: "var(--ink-2)" }}>
                {format(r.p50)}
              </text>
            </g>
          );
        })}
      </svg>
      {active !== null ? (
        <Tooltip
          x={x(rows[active].p50)}
          y={top + active * rowH}
          containerWidth={width}
          title={rows[active].label}
          rows={[
            { value: format(rows[active].p50), label: "median (P50)" },
            { value: `${format(rows[active].p10)}–${format(rows[active].p90)}`, label: "P10–P90 range" },
          ]}
          note={rows[active].sub}
        />
      ) : null}
    </div>
  );
}
