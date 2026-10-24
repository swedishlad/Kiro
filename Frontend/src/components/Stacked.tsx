import { scaleLinear } from "d3-scale";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import { monthTicks, textWidth } from "./axes.ts";
import { barPath } from "./BarChart.tsx";
import { useWidth } from "./hooks.ts";
import { LEVEL_LABELS, REGIME_META, RegimeIcon, type Regime, type RegimeLabels } from "./regime.tsx";
import { Tooltip } from "./ui.tsx";
import { fmtPct } from "../data/format.ts";

/** Order from the baseline up: the "High" share sits on the axis so it is the easiest to read. */
const STACK_ORDER: Regime[] = ["high", "mid", "low"];

/** 100% stacked columns of regime shares per month, 2px surface gaps between segments and bars. */
export function RegimeShareColumns({
  months,
  shares,
  height = 220,
  titleFor,
  ariaLabel,
  labels = LEVEL_LABELS,
}: {
  months: string[];
  shares: Record<Regime, number>[];
  height?: number;
  titleFor: (i: number) => ReactNode;
  ariaLabel: string;
  labels?: RegimeLabels;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = months.length;
  const left = textWidth("100%") + 10;
  const top = 8;
  const bottom = 24;
  const innerW = Math.max(40, width - left - 4);
  const innerH = height - top - bottom;
  const y = useMemo(() => scaleLinear().domain([0, 1]).range([top + innerH, top]), [innerH]);
  const step = innerW / Math.max(1, n);
  const barW = Math.max(1, Math.min(24, step - 2));
  const ticks = monthTicks(months, innerW);
  const GAP = 2;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const d = e.key === "ArrowRight" ? 1 : -1;
    setActive((a) => Math.max(0, Math.min(n - 1, (a ?? (d > 0 ? -1 : n)) + d)));
  };

  return (
    <div className="chart" ref={ref} tabIndex={0} role="group" aria-roledescription="chart" aria-label={`${ariaLabel}. Use arrow keys to read each month.`} onKeyDown={onKey} onBlur={() => setActive(null)}>
      <svg width={width} height={height}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line className={t === 0 ? "base-line" : "grid-line"} x1={left} x2={left + innerW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
            <text className="axis-text" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {fmtPct(t)}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t.i} className="axis-text" x={left + step * (t.i + 0.5)} y={top + innerH + 16} textAnchor="middle">
            {t.label}
          </text>
        ))}
        {shares.map((s, i) => {
          const cx = left + step * (i + 0.5);
          let acc = 0;
          const present = STACK_ORDER.filter((r) => s[r] > 0);
          const topmost = present[present.length - 1];
          return (
            <g key={months[i]} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onPointerDown={() => setActive(i)} opacity={active === null || active === i ? 1 : 0.55} className="mark-hover">
              <rect x={left + step * i} y={top} width={step} height={innerH} fill="transparent" />
              {STACK_ORDER.map((r) => {
                const v = s[r];
                if (v <= 0) return null;
                const y1 = y(acc);
                acc += v;
                const y2 = y(acc);
                // the surface gap is carved from the top of every segment except the topmost
                const h = Math.max(0, y1 - y2 - (r === topmost ? 0 : GAP));
                const yTop = r === topmost ? y2 : y2 + GAP;
                return r === topmost ? (
                  <path key={r} d={barPath(cx - barW / 2, yTop, barW, h, "top", Math.min(4, barW / 2))} style={{ fill: REGIME_META[r].color }} />
                ) : (
                  <rect key={r} x={cx - barW / 2} y={yTop} width={barW} height={h} style={{ fill: REGIME_META[r].color }} />
                );
              })}
            </g>
          );
        })}
      </svg>
      {active !== null ? (
        <Tooltip
          x={left + step * (active + 0.5)}
          y={top}
          containerWidth={width}
          title={titleFor(active)}
          rows={(["high", "mid", "low"] as Regime[]).map((r) => ({
            key: <RegimeIcon regime={r} />,
            value: fmtPct(shares[active][r]),
            label: `of days ${labels[r].toLowerCase()}`,
          }))}
        />
      ) : null}
    </div>
  );
}

/** One horizontal 100% bar (e.g. outlook probabilities). Labels sit inside a segment only if they fit. */
export function RegimeStackBar({
  probs,
  height = 26,
  ariaLabel,
  labels = LEVEL_LABELS,
}: {
  probs: Record<Regime, number>;
  height?: number;
  ariaLabel: string;
  labels?: RegimeLabels;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(300);
  const order: Regime[] = ["low", "mid", "high"];
  const present = order.filter((r) => probs[r] > 0.0005);
  let x = 0;
  return (
    <div className="chart" ref={ref} role="img" aria-label={`${ariaLabel}: ${order.map((r) => `${labels[r]} ${fmtPct(probs[r])}`).join(", ")}`}>
      <svg width={width} height={height}>
        {present.map((r, k) => {
          const w = probs[r] * width;
          const x0 = x;
          x += w;
          const first = k === 0;
          const last = k === present.length - 1;
          const segW = Math.max(0, w - (last ? 0 : 2));
          const label = `${labels[r]} ${fmtPct(probs[r])}`;
          const fits = textWidth(label, 12) + 14 < segW;
          let d: string;
          if (first && last) d = `M${x0 + 4},0H${x0 + segW - 4}Q${x0 + segW},0 ${x0 + segW},4V${height - 4}Q${x0 + segW},${height} ${x0 + segW - 4},${height}H${x0 + 4}Q${x0},${height} ${x0},${height - 4}V4Q${x0},0 ${x0 + 4},0Z`;
          else if (first) d = barPath(x0, 0, segW, height, "left");
          else if (last) d = barPath(x0, 0, segW, height, "right");
          else d = `M${x0},0H${x0 + segW}V${height}H${x0}Z`;
          return (
            <g key={r}>
              <path d={d} style={{ fill: REGIME_META[r].color }} />
              {fits ? (
                <text x={x0 + 8} y={height / 2} dy="0.32em" fontSize={12} fontWeight={600} fill="#ffffff">
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
