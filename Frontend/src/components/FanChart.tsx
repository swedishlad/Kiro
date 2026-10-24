// History + forecast fan for the Monte Carlo grid forecast, the design of Backend/viz/examples/05_forecast_fan.svg:
// actual monthly load for the last two years, then the forecast median, its 50% and 90% ranges and the simulated
// sample paths, all fanning out of the last actual month so the line is continuous. A month in progress (data not
// complete, not forecast) is bridged, not drawn; its tooltip says so. Hover or arrow keys read any month.

import { scaleLinear } from "d3-scale";
import { area as d3area, line as d3line } from "d3-shape";
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import { monthTicks, textWidth } from "./axes.ts";
import { useWidth } from "./hooks.ts";
import { Tooltip, type TooltipRow } from "./ui.tsx";
import { addMonths, dateLabel, fmtNum, ymIndex, ymLabel } from "../data/format.ts";
import type { Quantiles } from "../data/model.ts";

export interface FanChartProps {
  /** full months of actual load, ascending */
  history: { ym: string; gwh: number }[];
  /** the forecast months with their quantiles */
  forecast: (Quantiles & { ym: string })[];
  /** sample paths × forecast months */
  paths: number[][];
  /** the same months a year earlier, observed */
  lastYear: number[];
  /** last day with data, YYYY-MM-DD */
  dataThrough: string;
  height?: number;
  ariaLabel: string;
}

type Slot = { ym: string; kind: "actual" | "gap" | "forecast"; k: number };

export function FanChart({ history, forecast, paths, lastYear, dataThrough, height = 300, ariaLabel }: FanChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const slots = useMemo<Slot[]>(() => {
    const out: Slot[] = history.map((h, k) => ({ ym: h.ym, kind: "actual", k }));
    if (history.length && forecast.length)
      for (let ym = addMonths(history[history.length - 1].ym, 1); ymIndex(ym) < ymIndex(forecast[0].ym); ym = addMonths(ym, 1)) out.push({ ym, kind: "gap", k: -1 });
    forecast.forEach((f, k) => out.push({ ym: f.ym, kind: "forecast", k }));
    return out;
  }, [history, forecast]);

  const geo = useMemo(() => {
    const vals = [...history.map((h) => h.gwh), ...forecast.flatMap((f) => [f.p5, f.p95]), ...paths.flat()];
    const y = scaleLinear().domain([Math.min(...vals), Math.max(...vals)]).nice(5);
    const ticks = y.ticks(5);
    const left = Math.max(...ticks.map((t) => textWidth(fmtNum(t)))) + 10;
    const right = 14;
    const top = 22;
    const bottom = 26;
    const innerW = Math.max(40, width - left - right);
    const innerH = height - top - bottom;
    y.range([top + innerH, top]);
    const n = slots.length;
    const xAt = (i: number) => left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const first = slots.findIndex((s) => s.kind === "forecast");
    const lastActual = history.length - 1;
    return { y, ticks, left, top, innerW, innerH, xAt, first, lastActual, xTicks: monthTicks(slots.map((s) => s.ym), innerW) };
  }, [history, forecast, paths, slots, width, height]);

  const { y, ticks, left, top, innerW, innerH, xAt, first, lastActual, xTicks } = geo;
  const fx = (k: number) => xAt(first + k);
  // the forecast series start at the seam (last actual month) so actual and forecast join
  const seam = lastActual >= 0 ? history[lastActual].gwh : null;
  const sx = (k: number) => (seam === null ? fx(k) : k === 0 ? xAt(lastActual) : fx(k - 1));
  const withSeam = (vals: number[]) => (seam === null ? vals : [seam, ...vals]);
  const band = (lo: keyof Quantiles, hi: keyof Quantiles) => {
    const l = withSeam(forecast.map((f) => f[lo]));
    const h = withSeam(forecast.map((f) => f[hi]));
    return d3area<number>().x((_, k) => sx(k)).y0((_, k) => y(l[k])).y1((_, k) => y(h[k]))(l) ?? "";
  };
  const lineOf = (vals: number[], x: (k: number) => number) => d3line<number>().x((_, k) => x(k)).y((v) => y(v))(vals) ?? "";
  const divider = lastActual >= 0 ? xAt(lastActual) : left;
  const plotBottom = top + innerH;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const n = slots.length;
    setActive(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = slots.length;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      setActive((v) => Math.max(0, Math.min(n - 1, (v ?? (d > 0 ? -1 : n)) + d)));
    } else if (e.key === "Escape") setActive(null);
  };

  let rows: TooltipRow[] = [];
  let note: string | undefined;
  const s = active === null ? null : slots[active];
  if (s?.kind === "actual") rows = [{ color: "var(--ink)", value: `${fmtNum(history[s.k].gwh)} GWh`, label: "actual" }];
  else if (s?.kind === "gap") note = `In progress: data through ${dateLabel(dataThrough)}.`;
  else if (s?.kind === "forecast") {
    const f = forecast[s.k];
    rows = [
      { color: "var(--series-1)", value: `${fmtNum(f.p50)} GWh`, label: "median forecast" },
      { key: "rect", color: "var(--series-1)", value: `${fmtNum(f.p25)}–${fmtNum(f.p75)}`, label: "50% range" },
      { key: "rect", color: "var(--fan-90)", value: `${fmtNum(f.p5)}–${fmtNum(f.p95)}`, label: "90% range" },
      { color: "var(--ink-2)", value: `${fmtNum(lastYear[s.k])} GWh`, label: "a year earlier" },
    ];
  }

  return (
    <div
      className="chart fan-chart"
      ref={ref}
      tabIndex={0}
      role="group"
      aria-roledescription="chart"
      aria-label={`${ariaLabel}. Use left and right arrow keys to read values; the table view lists them all.`}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
    >
      <svg width={width} height={height}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={left} x2={left + innerW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
            <text className="axis-text" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t.i} className="axis-text" x={xAt(t.i)} y={plotBottom + 18} textAnchor="middle">
            {t.label}
          </text>
        ))}
        <rect x={divider} y={top} width={left + innerW - divider} height={innerH} className="fan-future" />
        {forecast.map((f, k) =>
          f.ym.endsWith("-02") || f.ym.endsWith("-08") ? (
            <g key={f.ym}>
              <line className="fan-reset" x1={fx(k) - (fx(1) - fx(0)) / 2} x2={fx(k) - (fx(1) - fx(0)) / 2} y1={top} y2={plotBottom} />
              <text className="axis-text" x={fx(k) - (fx(1) - fx(0)) / 2 - 4} y={top + 10} textAnchor="end">
                {f.ym.endsWith("-02") ? "Feb" : "Aug"} 1 rate reset
              </text>
            </g>
          ) : null,
        )}
        <path d={band("p5", "p95")} className="fan-band-90" />
        <path d={band("p25", "p75")} className="fan-band-50" />
        {paths.map((p, i) => (
          <path key={i} d={lineOf(withSeam(p), sx)} fill="none" className="fan-path" />
        ))}
        <path d={lineOf(withSeam(forecast.map((f) => f.p50)), sx)} fill="none" className="fan-median" />
        <path d={lineOf(history.map((h) => h.gwh), xAt)} fill="none" className="fan-actual" />
        {lastActual >= 0 ? <circle cx={xAt(lastActual)} cy={y(history[lastActual].gwh)} r={3.5} className="fan-seam" /> : null}
        <line className="fan-divider" x1={divider} x2={divider} y1={top - 14} y2={plotBottom} />
        <text className="axis-text" x={divider - 6} y={top - 6} textAnchor="end">
          actual
        </text>
        <text className="fan-forecast-label" x={divider + 6} y={top - 6}>
          forecast →
        </text>
        {active !== null ? <line className="crosshair" x1={Math.round(xAt(active)) + 0.5} x2={Math.round(xAt(active)) + 0.5} y1={top} y2={plotBottom} /> : null}
        <rect x={left} y={top} width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActive(null)} />
      </svg>
      {s ? <Tooltip x={xAt(active as number)} y={top + 4} containerWidth={width} title={ymLabel(s.ym)} rows={rows} note={note} /> : null}
    </div>
  );
}
