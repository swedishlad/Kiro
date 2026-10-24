// The energy regime nowcast: a dark, terminal-style view of the usual-range HMM (regimes.json), drawn like
// Backend/docs/img/examples/regime_nowcast_*.png. Top: use vs the historical average in sd, each point shaped and
// coloured by its filtered state, with the three state means. Bottom: the filtered P(state) stacked and, for homes,
// the next six months (hatched where only the long-run odds are known). Colours are scoped to .nowcast (styles.css).

import { scaleLinear } from "d3-scale";
import { area as d3area, curveLinear, curveStep, line as d3line } from "d3-shape";
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import { dayTicks, monthTicks } from "./axes.ts";
import { useWidth } from "./hooks.ts";
import { RANGE_LABELS, RANGE_SHORT, RegimeIcon, fromGrid, type Regime } from "./regime.tsx";
import { Tooltip, type TooltipRow } from "./ui.tsx";
import { MONTHS, dateLabel, fmtNum, fmtPct, ymIndex, ymLabel } from "../data/format.ts";
import type { GridArea, GridColor, RangePoint } from "../data/model.ts";
import { STACK, Z_LIM, forecastBars, headline, nextLine, nowPoints, pctPerSd, type NowPoint } from "../data/nowcast.ts";

/** TC's words for the three states (red = too much, grey = mid, green = good) */
const WORD: Record<GridColor, string> = { red: "too much", grey: "mid", green: "good" };
const FILL: Record<GridColor, string> = { green: "var(--low)", grey: "var(--mid)", red: "var(--high)" };
const TOP_H = 230;
const BOT_H = 150;
const PAD = 10;
const AXIS_H = 28;
const LEFT = 40;

const signed = (v: number, d = 1) => `${v > 0.00001 ? "+" : v < -0.00001 ? "−" : ""}${fmtNum(Math.abs(v), d)}`;

/** Marker path at (x, y), the same shapes as RegimeIcon: ▼ below · ● within · ▲ above. */
function shapeAt(r: Regime, x: number, y: number, s: number): string {
  if (r === "low") return `M${x - s},${y - s * 0.75}L${x + s},${y - s * 0.75}L${x},${y + s}Z`;
  if (r === "high") return `M${x - s},${y + s * 0.75}L${x + s},${y + s * 0.75}L${x},${y - s}Z`;
  return `M${x + s},${y}A${s},${s} 0 1,1 ${x - s},${y}A${s},${s} 0 1,1 ${x + s},${y}Z`;
}

export interface RegimeNowcastProps {
  area: GridArea;
  /** the points to draw (the page's year filter applied); the forecast shows when they reach the latest point */
  timeline: RangePoint[];
  /** every regimes.json area, for the "what the data says" line */
  areas: GridArea[];
  title: string;
  /** short name for the summary line, e.g. "Homes" */
  label: string;
}

export function RegimeNowcast({ area: a, timeline, areas, title, label }: RegimeNowcastProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const hatchId = `nowcast-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const monthly = a.unit === "month";
  const pts = useMemo(() => nowPoints(timeline), [timeline]);
  const allFc = useMemo(() => forecastBars(a), [a]);
  const reachesNow = timeline.length > 0 && timeline[timeline.length - 1].date === a.current.date;
  const fc = useMemo(() => (reachesNow ? allFc : []), [reachesNow, allFc]);
  const n = pts.length;
  const N = n + fc.length;
  const narrow = width < 560;
  const right = narrow ? 10 : 124;
  const innerW = Math.max(40, width - LEFT - right);
  const xAt = (i: number) => LEFT + (N <= 1 ? innerW / 2 : (i / (N - 1)) * innerW);
  const slot = N > 1 ? innerW / (N - 1) : innerW;
  const yTop = scaleLinear().domain([-Z_LIM, Z_LIM]).range([PAD + TOP_H, PAD]);
  const yBot = scaleLinear().domain([0, 1]).range([PAD + BOT_H, PAD]);

  // xAt depends only on innerW and N; yTop / yBot are fixed.
  const drawn = useMemo(() => {
    const size = monthly ? Math.max(2, Math.min(4, slot * 0.45)) : 1.7;
    const marks: Record<GridColor, string> = { green: "", grey: "", red: "" };
    pts.forEach((p, i) => {
      marks[p.color] += shapeAt(fromGrid(p.color), xAt(i), yTop(p.z), size);
    });
    const zLine = d3line<NowPoint>().x((_, i) => xAt(i)).y((p) => yTop(p.z))(pts) ?? "";
    const stacks = STACK.map(
      (_, k) =>
        d3area<NowPoint>()
          .x((_, i) => xAt(i))
          .y0((p) => yBot(p.probs.slice(0, k).reduce((s, v) => s + v, 0)))
          .y1((p) => yBot(p.probs.slice(0, k + 1).reduce((s, v) => s + v, 0)))
          .curve(monthly ? curveStep : curveLinear)(pts) ?? "",
    );
    const xs = monthly ? [...pts.map((p) => p.date.slice(0, 7)), ...fc.map((f) => f.ym)] : pts.map((p) => p.date);
    const ticks = monthly ? monthTicks(xs, innerW) : dayTicks(xs, innerW);
    return { marks, zLine, stacks, ticks };
  }, [pts, fc, monthly, innerW, N, slot]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!n)
    return (
      <div className="nowcast" ref={ref}>
        <p className="now-muted">No points in this range.</p>
      </div>
    );

  const h = headline(a);
  const means = a.states.map((s) => s.meanSdFromAverage);
  const per = pctPerSd(a.timeline);
  const next = nextLine(allFc);
  const asOf = monthly ? ymLabel(a.current.date.slice(0, 7)) : dateLabel(a.current.date);
  const zones = areas.filter((z) => z.area === "NEMA" || z.area === "SEMA" || z.area === "WCMA");
  const divider = fc.length && n ? (xAt(n - 1) + xAt(n)) / 2 : null;
  const barW = Math.max(3, Math.min(slot * 0.88, 30));

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = N <= 1 ? 0 : Math.round(((e.clientX - rect.left) / rect.width) * (N - 1));
    setActive(Math.max(0, Math.min(N - 1, i)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      setActive((v) => Math.max(0, Math.min(N - 1, (v ?? (d > 0 ? -1 : N)) + d)));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(N - 1);
    else if (e.key === "Escape") setActive(null);
  };

  const probRows = (p: [number, number, number]): TooltipRow[] =>
    [2, 1, 0].map((k) => ({ key: "rect", color: FILL[STACK[k]], value: fmtPct(p[k]), label: `P(${RANGE_SHORT[fromGrid(STACK[k])].toLowerCase()})` }));
  let tip: { title: string; rows: TooltipRow[]; note?: string } | null = null;
  if (active !== null && active < n) {
    const p = pts[active];
    tip = {
      title: monthly ? ymLabel(p.date.slice(0, 7)) : dateLabel(p.date),
      rows: [
        { key: <RegimeIcon regime={fromGrid(p.color)} />, value: RANGE_LABELS[fromGrid(p.color)], label: WORD[p.color] },
        { value: `${signed(p.pct)}%`, label: "vs the 5-year average" },
        { value: `${signed(p.sd, 2)} sd`, label: `usual range ±${fmtNum(p.band, 1)}%` },
        ...probRows(p.probs),
      ],
      note: Math.abs(p.sd) > Z_LIM ? `Drawn at the ${Z_LIM} sd edge.` : undefined,
    };
  } else if (active !== null) {
    const f = fc[active - n];
    tip = {
      title: `${ymLabel(f.ym)} · forecast`,
      rows: probRows(f.probs),
      note: f.model ? `Tested model: beat the long-run odds by ${fmtPct(f.skill, 1)} walk-forward.` : "Long-run odds: no model beat history this far ahead.",
    };
  }

  const crosshair = (y1: number, y2: number) =>
    active === null ? null : <line className="now-cross" x1={Math.round(xAt(active)) + 0.5} x2={Math.round(xAt(active)) + 0.5} y1={y1} y2={y2} />;
  const overlay = (height: number) => (
    <rect x={LEFT} y={0} width={innerW} height={height} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActive(null)} />
  );

  return (
    <div className="nowcast" ref={ref}>
      <div className="nowcast-head">
        <p>
          <span className="now-title">ENERGY REGIME NOWCAST</span>{" "}
          <span className="now-muted">· 3-state HMM on consumption vs the historical average range, filtered (past data only)</span>
        </p>
        <p className="now-big">
          now:{" "}
          <span className="now-state" style={{ color: FILL[h.color] }}>
            <RegimeIcon regime={fromGrid(h.color)} size={13} /> {h.color.toUpperCase()} ({fmtPct(h.p)})
          </span>{" "}
          · {signed(a.current.pctVsAverage)}% vs historical avg (range ±{fmtNum(a.current.bandPct, 1)}%) · state means{" "}
          {means.map((m) => signed(m, 1)).join(" / ")} sd (≈ {means.map((m) => `${signed(m * per, 0)}%`).join(" / ")})
        </p>
        <p className="now-muted">
          {title} · as of {asOf}
        </p>
        {allFc.length ? (
          <p className="now-teal">
            next:{" "}
            {next.model.length
              ? next.model.map((f) => `${MONTHS[ymIndex(f.ym) % 12]} ${RANGE_SHORT[fromGrid(f.color)].toLowerCase()} (${fmtPct(f.probs[2])} above)`).join(" · ")
              : "no tested forecast"}{" "}
            · after that: long-run odds ({next.longRun} months, hatched)
          </p>
        ) : null}
      </div>

      <div
        className="chart"
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`Regime nowcast for ${title}: use versus the historical average in standard deviations, and the filtered probability of each regime. Use left and right arrow keys to read values; the table view lists them all.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={TOP_H + 2 * PAD}>
          <text className="now-axis" x={LEFT} y={PAD - 1}>
            sd from the historical average
          </text>
          {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((t) => (
            <g key={t}>
              <line className={t === -1 || t === 1 ? "now-edge" : "now-grid"} x1={LEFT} x2={LEFT + innerW} y1={Math.round(yTop(t)) + 0.5} y2={Math.round(yTop(t)) + 0.5} />
              <text className="now-axis" x={LEFT - 8} y={yTop(t)} dy="0.32em" textAnchor="end">
                {t > 0 ? `+${t}` : t < 0 ? `−${-t}` : "0"}
              </text>
            </g>
          ))}
          {a.states.map((s) => (
            <g key={s.color}>
              <line x1={LEFT} x2={LEFT + innerW} y1={yTop(s.meanSdFromAverage)} y2={yTop(s.meanSdFromAverage)} style={{ stroke: FILL[s.color] }} strokeWidth={1.4} />
              {!narrow ? (
                <g>
                  <path d={shapeAt(fromGrid(s.color), LEFT + innerW + 14, yTop(s.meanSdFromAverage), 4.5)} style={{ fill: FILL[s.color] }} />
                  <text className="now-label" x={LEFT + innerW + 24} y={yTop(s.meanSdFromAverage)} dy="0.32em">
                    {WORD[s.color]} {signed(s.meanSdFromAverage, 1)} sd
                  </text>
                </g>
              ) : null}
            </g>
          ))}
          <path d={drawn.zLine} fill="none" className="now-zline" strokeWidth={monthly ? 1 : 0.6} />
          {STACK.map((c) => (
            <path key={c} d={drawn.marks[c]} style={{ fill: FILL[c] }} />
          ))}
          {divider !== null ? <line className="now-divider" x1={divider} x2={divider} y1={PAD} y2={PAD + TOP_H} /> : null}
          {crosshair(PAD, PAD + TOP_H)}
          {active !== null && active < n ? (
            <path d={shapeAt(fromGrid(pts[active].color), xAt(active), yTop(pts[active].z), monthly ? 6 : 4)} className="now-focus" style={{ fill: FILL[pts[active].color] }} />
          ) : null}
          {overlay(TOP_H + 2 * PAD)}
        </svg>

        <div className="nowcast-legend">
          {(["red", "grey", "green"] as GridColor[]).map((c) => (
            <span key={c}>
              <RegimeIcon regime={fromGrid(c)} /> {WORD[c]} <span className="now-muted">({RANGE_SHORT[fromGrid(c)].toLowerCase()})</span>
            </span>
          ))}
          {fc.length ? (
            <span>
              <svg width="14" height="10" aria-hidden="true">
                <rect width="14" height="10" style={{ fill: "var(--mid)" }} opacity={0.5} />
                <rect width="14" height="10" fill={`url(#${hatchId})`} />
              </svg>
              long-run odds
            </span>
          ) : null}
        </div>

        <svg width={width} height={BOT_H + 2 * PAD + AXIS_H}>
          <defs>
            <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" className="now-hatch" strokeWidth="2" />
            </pattern>
          </defs>
          <text className="now-axis" x={LEFT} y={PAD - 1}>
            P(state), filtered
          </text>
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line className="now-grid" x1={LEFT} x2={LEFT + innerW} y1={Math.round(yBot(t)) + 0.5} y2={Math.round(yBot(t)) + 0.5} />
              <text className="now-axis" x={LEFT - 8} y={yBot(t)} dy="0.32em" textAnchor="end">
                {fmtPct(t)}
              </text>
            </g>
          ))}
          {STACK.map((c, k) => (
            <path key={c} d={drawn.stacks[k]} style={{ fill: FILL[c] }} />
          ))}
          {fc.map((f, j) => {
            let base = 0;
            return (
              <g key={f.ym}>
                {STACK.map((c, k) => {
                  const y0 = yBot(base);
                  base += f.probs[k];
                  const y1 = yBot(base);
                  return (
                    <g key={c}>
                      <rect x={xAt(n + j) - barW / 2} width={barW} y={y1} height={Math.max(0, y0 - y1)} style={{ fill: FILL[c] }} opacity={f.model ? 0.95 : 0.5} />
                      {f.model ? null : <rect x={xAt(n + j) - barW / 2} width={barW} y={y1} height={Math.max(0, y0 - y1)} fill={`url(#${hatchId})`} />}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {divider !== null ? (
            <g>
              <line className="now-divider" x1={divider} x2={divider} y1={PAD} y2={PAD + BOT_H} />
              <text
                className="now-teal-text"
                x={divider + 84 <= width ? divider + 6 : divider - 6}
                y={PAD - 1}
                textAnchor={divider + 84 <= width ? "start" : "end"}
              >
                forecast →
              </text>
            </g>
          ) : null}
          {drawn.ticks.map((t) => (
            <text key={t.i} className="now-axis" x={xAt(t.i)} y={PAD + BOT_H + 18} textAnchor="middle">
              {t.label}
            </text>
          ))}
          {crosshair(PAD, PAD + BOT_H)}
          {overlay(BOT_H + 2 * PAD)}
        </svg>
        {tip ? <Tooltip x={xAt(active as number)} y={PAD + 4} containerWidth={width} title={tip.title} rows={tip.rows} note={tip.note} /> : null}
      </div>

      <div className="nowcast-foot">
        <p>
          WHAT THE DATA SAYS ({asOf}): {label} {h.color.toUpperCase()} · {signed(a.current.pctVsAverage)}% vs avg
          {zones.length ? ` · grid zones on ${dateLabel(zones[0].current.date)}: ` : ""}
          {zones.map((z, i) => (
            <span key={z.area}>
              {i ? " · " : ""}
              {z.area} <RegimeIcon regime={fromGrid(z.current.color)} size={10} /> {RANGE_SHORT[fromGrid(z.current.color)].toLowerCase()}
            </span>
          ))}
        </p>
        <p>red = above the historical average range · grey = within · green = below · range = avg ± 1 sd of the same period in the previous 5 years</p>
      </div>
    </div>
  );
}
