import { scaleBand, scaleLinear } from "d3-scale";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import { categoryTicks, textWidth } from "./axes.ts";
import { useWidth } from "./hooks.ts";
import { Tooltip, type TooltipRow } from "./ui.tsx";

/** Rect with a 4px rounded data-end and a square baseline end (vertical or horizontal, either sign). */
export function barPath(x: number, y: number, w: number, h: number, end: "top" | "bottom" | "right" | "left", r = 4): string {
  if (w <= 0 || h <= 0) return "";
  const rr = Math.min(r, (end === "top" || end === "bottom" ? w : h) / 2, end === "top" || end === "bottom" ? h : w);
  switch (end) {
    case "top":
      return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
    case "bottom":
      return `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`;
    case "right":
      return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
    case "left":
      return `M${x + w},${y}H${x + rr}Q${x},${y} ${x},${y + rr}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w}Z`;
  }
}

export interface ColumnChartProps {
  categories: string[];
  values: number[];
  colorFor: (i: number) => string;
  height?: number;
  yFormat: (v: number) => string;
  valueFormat: (v: number) => string;
  /** which columns carry a value label on the cap (selective, never all by default) */
  labelled?: number[];
  titleFor: (i: number) => ReactNode;
  rowsFor?: (i: number) => TooltipRow[];
  noteFor?: (i: number) => ReactNode;
  tickLabel?: (i: number) => string;
  ariaLabel: string;
}

/** Vertical columns from a single zero baseline; negative values hang below it. */
export function ColumnChart({
  categories,
  values,
  colorFor,
  height = 240,
  yFormat,
  valueFormat,
  labelled = [],
  titleFor,
  rowsFor,
  noteFor,
  tickLabel,
  ariaLabel,
}: ColumnChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const g = useMemo(() => {
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    const y = scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).nice(5);
    const ticks = y.ticks(5);
    const left = Math.max(...ticks.map((t) => textWidth(yFormat(t)))) + 10;
    const top = labelled.length ? 22 : 10;
    const bottom = 24 + (lo < 0 && labelled.length ? 16 : 0);
    const innerW = Math.max(40, width - left - 8);
    const innerH = height - top - bottom;
    y.range([top + innerH, top]);
    const x = scaleBand<number>().domain(categories.map((_, i) => i)).range([left, left + innerW]).paddingInner(0.25).paddingOuter(0.15);
    const barW = Math.min(24, x.bandwidth());
    const labels = categories.map((c, i) => tickLabel?.(i) ?? c);
    const ticksX = categoryTicks(labels, innerW, Math.max(28, Math.max(...labels.map((l) => textWidth(l))) + 10));
    return { y, ticks, left, top, innerW, innerH, x, barW, ticksX };
  }, [values, categories, yFormat, labelled.length, width, height, tickLabel]);

  const { y, ticks, left, top, innerW, innerH, x, barW, ticksX } = g;
  const y0 = y(0);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const d = e.key === "ArrowRight" ? 1 : -1;
    setActive((a) => Math.max(0, Math.min(values.length - 1, (a ?? (d > 0 ? -1 : values.length)) + d)));
  };

  return (
    <div className="chart" ref={ref} tabIndex={0} role="group" aria-roledescription="chart" aria-label={`${ariaLabel}. Use arrow keys to read values.`} onKeyDown={onKey} onBlur={() => setActive(null)}>
      <svg width={width} height={height}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "base-line" : "grid-line"} x1={left} x2={left + innerW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
            <text className="axis-text" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {ticksX.map((t) => (
          <text key={t.i} className="axis-text" x={(x(t.i) ?? 0) + x.bandwidth() / 2} y={top + innerH + 16} textAnchor="middle">
            {t.label}
          </text>
        ))}
        {values.map((v, i) => {
          const cx = (x(i) ?? 0) + x.bandwidth() / 2;
          const yv = y(v);
          const h = Math.abs(yv - y0);
          const d = v >= 0 ? barPath(cx - barW / 2, yv, barW, h, "top") : barPath(cx - barW / 2, y0, barW, h, "bottom");
          return (
            <g key={i} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onPointerDown={() => setActive(i)}>
              <rect x={x(i)} y={top} width={x.bandwidth()} height={innerH} fill="transparent" />
              <path d={d} style={{ fill: colorFor(i) }} opacity={active === null || active === i ? 1 : 0.55} className="mark-hover" />
              {labelled.includes(i) ? (
                <text className="direct-label-strong" x={cx} y={v >= 0 ? yv - 6 : yv + 14} textAnchor="middle">
                  {valueFormat(v)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {active !== null ? (
        <Tooltip
          x={(x(active) ?? 0) + x.bandwidth() / 2}
          y={top}
          containerWidth={width}
          title={titleFor(active)}
          rows={rowsFor ? rowsFor(active) : [{ key: "rect", color: colorFor(active), value: valueFormat(values[active]), label: categories[active] }]}
          note={noteFor?.(active)}
        />
      ) : null}
    </div>
  );
}

export interface HBarRow {
  label: string;
  sub?: string;
  value: number;
  color: string;
}

/** Horizontal bars with the category on the left and the value at the tip. */
export function HBarChart({
  rows,
  valueFormat,
  ariaLabel,
  barHeight = 18,
  gap = 14,
  domainMax,
}: {
  rows: HBarRow[];
  valueFormat: (v: number) => string;
  ariaLabel: string;
  barHeight?: number;
  gap?: number;
  domainMax?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const labelW = Math.min(170, Math.max(...rows.map((r) => textWidth(r.label, 12))) + 12);
  const valueW = Math.max(...rows.map((r) => textWidth(valueFormat(r.value), 12))) + 10;
  const innerW = Math.max(40, width - labelW - valueW);
  const max = domainMax ?? Math.max(...rows.map((r) => r.value));
  const xs = scaleLinear().domain([0, max]).range([0, innerW]);
  const rowH = barHeight + gap + (rows.some((r) => r.sub) ? 12 : 0);
  const height = rows.length * rowH;
  return (
    <div className="chart" ref={ref} role="img" aria-label={`${ariaLabel}: ${rows.map((r) => `${r.label} ${valueFormat(r.value)}`).join("; ")}`}>
      <svg width={width} height={height}>
        {rows.map((r, i) => {
          const y = i * rowH + gap / 2;
          const w = xs(r.value);
          return (
            <g key={r.label}>
              <text className="direct-label" x={0} y={y + barHeight / 2} dy="0.32em" style={{ fill: "var(--ink)" }}>
                {r.label}
              </text>
              {r.sub ? (
                <text className="axis-text" x={0} y={y + barHeight / 2 + 15} dy="0.32em">
                  {r.sub}
                </text>
              ) : null}
              <line className="base-line" x1={labelW + 0.5} x2={labelW + 0.5} y1={y - 3} y2={y + barHeight + 3} />
              <path d={barPath(labelW, y, w, barHeight, "right")} style={{ fill: r.color }} />
              <text className="direct-label-strong" x={labelW + w + 6} y={y + barHeight / 2} dy="0.32em">
                {valueFormat(r.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
