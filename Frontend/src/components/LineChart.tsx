import { scaleLinear } from "d3-scale";
import { line as d3line, area as d3area } from "d3-shape";
import { useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { categoryTicks, dayTicks, monthTicks, textWidth } from "./axes.ts";
import { useWidth } from "./hooks.ts";
import { LEVEL_LABELS, REGIME_META, RegimeIcon, type Regime, type RegimeLabels } from "./regime.tsx";
import { Tooltip, type TooltipRow } from "./ui.tsx";

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  /** context series: thin, behind, no end label */
  muted?: boolean;
}

export interface LineBand {
  label: string;
  color: string;
  lower: (number | null)[];
  upper: (number | null)[];
}

export interface LineChartProps {
  x: string[];
  /** month = YYYY-MM, day = YYYY-MM-DD, category = free labels */
  xKind: "month" | "day" | "category";
  series: LineSeries[];
  band?: LineBand;
  /** one regime per x, drawn as a strip under the plot */
  strip?: { label: string; values: (Regime | null)[]; labels?: RegimeLabels };
  /** baseline-weight reference lines; an empty label draws the line alone */
  refLines?: { y: number; label: string }[];
  height?: number;
  zeroBased?: boolean;
  yFormat: (v: number) => string;
  valueFormat: (v: number) => string;
  titleFor: (i: number) => ReactNode;
  noteFor?: (i: number) => ReactNode;
  endLabels?: boolean;
  ariaLabel: string;
}

const STRIP_H = 10;

export function LineChart({
  x,
  xKind,
  series,
  band,
  strip,
  refLines = [],
  height = 260,
  zeroBased = false,
  yFormat,
  valueFormat,
  titleFor,
  noteFor,
  endLabels = false,
  ariaLabel,
}: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = x.length;

  const geo = useMemo(() => {
    const vals: number[] = [];
    for (const s of series) for (const v of s.values) if (v !== null) vals.push(v);
    if (band) for (const arr of [band.lower, band.upper]) for (const v of arr) if (v !== null) vals.push(v);
    for (const r of refLines) vals.push(r.y);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (zeroBased) lo = Math.min(0, lo);
    if (lo === hi) hi = lo + 1;
    const y = scaleLinear().domain([lo, hi]).nice(5);
    const ticks = y.ticks(5);
    const left = Math.max(...ticks.map((t) => textWidth(yFormat(t)))) + 10;
    const labelled = endLabels ? series.filter((s) => !s.muted) : [];
    const right = labelled.length ? Math.max(...labelled.map((s) => textWidth(s.label, 12))) + 16 : 12;
    const top = 10;
    const bottom = 24 + (strip ? STRIP_H + 8 : 0);
    const innerW = Math.max(40, width - left - right);
    const innerH = height - top - bottom;
    y.range([top + innerH, top]);
    const xAt = (i: number) => left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const xTicks = xKind === "month" ? monthTicks(x, innerW) : xKind === "day" ? dayTicks(x, innerW) : categoryTicks(x, innerW, 34);
    return { y, ticks, left, right, top, innerW, innerH, xAt, xTicks };
  }, [series, band, refLines, zeroBased, yFormat, endLabels, strip, width, height, n, x, xKind]);

  const { y, ticks, left, top, innerW, innerH, xAt, xTicks } = geo;

  const pathFor = (values: (number | null)[]) =>
    d3line<number | null>()
      .defined((v) => v !== null)
      .x((_, i) => xAt(i))
      .y((v) => y(v as number))(values) ?? "";

  const bandPath = band
    ? d3area<number>()
        .defined((i) => band.lower[i] !== null && band.upper[i] !== null)
        .x((i) => xAt(i))
        .y0((i) => y(band.lower[i] as number))
        .y1((i) => y(band.upper[i] as number))(x.map((_, i) => i)) ?? ""
    : "";

  // End labels only when they separate cleanly; otherwise the legend + tooltip carry identity.
  const ends = useMemo(() => {
    if (!endLabels) return [];
    const out = series
      .filter((s) => !s.muted)
      .map((s) => {
        let i = s.values.length - 1;
        while (i >= 0 && s.values[i] === null) i--;
        return i < 0 ? null : { s, i, yy: y(s.values[i] as number) };
      })
      .filter((e): e is { s: LineSeries; i: number; yy: number } => e !== null)
      .sort((a, b) => a.yy - b.yy);
    for (let k = 1; k < out.length; k++) if (out[k].yy - out[k - 1].yy < 14) return [];
    return out;
  }, [endLabels, series, y]);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      setActive((a) => Math.max(0, Math.min(n - 1, (a ?? (d > 0 ? -1 : n)) + d)));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
  };

  const tooltipRows: TooltipRow[] = [];
  if (active !== null) {
    for (const s of series) {
      const v = s.values[active];
      if (v !== null && v !== undefined) tooltipRows.push({ color: s.color, value: valueFormat(v), label: s.label });
    }
    if (band && band.lower[active] !== null && band.upper[active] !== null) {
      tooltipRows.push({
        key: "rect",
        color: band.color,
        value: `${valueFormat(band.lower[active] as number)}–${valueFormat(band.upper[active] as number)}`,
        label: band.label,
      });
    }
    const r = strip?.values[active];
    if (r) tooltipRows.push({ key: <RegimeIcon regime={r} />, value: (strip!.labels ?? LEVEL_LABELS)[r], label: strip!.label });
  }

  const plotBottom = top + innerH;
  const cellW = n > 0 ? innerW / Math.max(1, n - 1) : 0;

  return (
    <div
      className="chart"
      ref={ref}
      tabIndex={0}
      role="group"
      aria-roledescription="chart"
      aria-label={`${ariaLabel}. Use left and right arrow keys to read values; the table view lists them all.`}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
    >
      <svg width={width} height={height}>
        {/* grid + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 && zeroBased ? "base-line" : "grid-line"} x1={left} x2={left + innerW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
            <text className="axis-text" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {/* x ticks */}
        {xTicks.map((t) => (
          <text key={t.i} className="axis-text" x={xAt(t.i)} y={plotBottom + (strip ? STRIP_H + 8 : 0) + 16} textAnchor="middle">
            {t.label}
          </text>
        ))}
        {/* reference lines */}
        {refLines.map((r) => (
          <g key={r.label}>
            <line className="base-line" x1={left} x2={left + innerW} y1={Math.round(y(r.y)) + 0.5} y2={Math.round(y(r.y)) + 0.5} />
            {r.label ? (
              <text className="ref-label" x={left + 4} y={y(r.y) - 5}>
                {r.label}
              </text>
            ) : null}
          </g>
        ))}
        {band ? <path d={bandPath} style={{ fill: band.color }} opacity={0.14} /> : null}
        {series
          .filter((s) => s.muted)
          .map((s) => (
            <path key={s.id} d={pathFor(s.values)} fill="none" style={{ stroke: s.color }} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          ))}
        {series
          .filter((s) => !s.muted)
          .map((s) => (
            <path key={s.id} d={pathFor(s.values)} fill="none" style={{ stroke: s.color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
        {/* regime strip */}
        {strip
          ? strip.values.map((r, i) =>
              r ? (
                <rect
                  key={i}
                  x={xAt(i) - cellW / 2}
                  width={Math.max(1, cellW - (cellW > 4 ? 1 : 0))}
                  y={plotBottom + 6}
                  height={STRIP_H}
                  style={{ fill: REGIME_META[r].color }}
                />
              ) : null,
            )
          : null}
        {/* end markers + labels */}
        {ends.map(({ s, i, yy }) => (
          <g key={s.id}>
            <circle cx={xAt(i)} cy={yy} r={4} style={{ fill: s.color, stroke: "var(--surface)" }} strokeWidth={2} />
            <text className="direct-label" x={xAt(i) + 9} y={yy} dy="0.32em">
              {s.label}
            </text>
          </g>
        ))}
        {/* hover layer */}
        {active !== null ? (
          <g pointerEvents="none">
            <line className="crosshair" x1={Math.round(xAt(active)) + 0.5} x2={Math.round(xAt(active)) + 0.5} y1={top} y2={plotBottom + (strip ? STRIP_H + 6 : 0)} />
            {series.map((s) => {
              const v = s.values[active];
              return v === null || v === undefined ? null : (
                <circle key={s.id} cx={xAt(active)} cy={y(v)} r={4} style={{ fill: s.color, stroke: "var(--surface)" }} strokeWidth={2} />
              );
            })}
          </g>
        ) : null}
        <rect
          x={left}
          y={top}
          width={innerW}
          height={innerH + (strip ? STRIP_H + 8 : 0)}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
      {active !== null ? (
        <Tooltip
          x={xAt(active)}
          y={top + 4}
          containerWidth={width}
          title={titleFor(active)}
          rows={tooltipRows}
          note={noteFor?.(active)}
        />
      ) : null}
    </div>
  );
}
