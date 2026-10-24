import { useId, useMemo, useState, type ReactNode } from "react";

import { useWidth } from "./hooks.ts";

// ----------------------------------------------------------------------------- segmented control

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`segmented ${className ?? ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filter">
      <span className="filter-label">{label}</span>
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------- chart card

export interface Column<R> {
  key: string;
  label: string;
  align?: "r";
  render: (row: R) => ReactNode;
  sort?: (row: R) => number | string;
}

/**
 * A titled card whose chart always has a table twin (the accessible equivalent): tooltips enhance,
 * the table guarantees every plotted value is reachable without hovering.
 */
export function ChartCard<R>({
  title,
  subtitle,
  source,
  children,
  table,
  className,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  source?: ReactNode;
  children: ReactNode;
  table?: { columns: Column<R>[]; rows: R[]; caption?: string };
  className?: string;
  actions?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const headingId = useId();
  return (
    <section className={`card ${className ?? ""}`} aria-labelledby={headingId}>
      <div className="card-head">
        <div>
          <h3 className="card-title" id={headingId}>
            {title}
          </h3>
          {subtitle ? <p className="card-sub">{subtitle}</p> : null}
        </div>
        <div className="card-actions">
          {actions}
          {table ? (
            <Segmented
              className="view-toggle"
              label="View as"
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: "Chart" },
                { value: "table", label: "Table" },
              ]}
            />
          ) : null}
        </div>
      </div>
      {view === "chart" || !table ? children : <DataTable columns={table.columns} rows={table.rows} caption={table.caption ?? String(title)} />}
      {source ? <p className="card-foot">{source}</p> : null}
    </section>
  );
}

export function Card({
  title,
  subtitle,
  children,
  className,
  source,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  source?: ReactNode;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section id={id} className={`card ${className ?? ""}`} aria-labelledby={title ? headingId : undefined}>
      {title ? (
        <div className="card-head">
          <div>
            <h3 className="card-title" id={headingId}>
              {title}
            </h3>
            {subtitle ? <p className="card-sub">{subtitle}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
      {source ? <p className="card-foot">{source}</p> : null}
    </section>
  );
}

// ----------------------------------------------------------------------------- table

export function DataTable<R>({
  columns,
  rows,
  caption,
  maxHeight,
  initialSort,
  rowKey,
  selected,
  onRowClick,
}: {
  columns: Column<R>[];
  rows: R[];
  caption: string;
  maxHeight?: number | "none";
  initialSort?: { key: string; dir: 1 | -1 };
  rowKey?: (row: R, i: number) => string | number;
  selected?: string | number | null;
  onRowClick?: (row: R) => void;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, columns, sort]);

  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="data">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={c.align === "r" ? "r" : undefined}
                  scope="col"
                  aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      className="th-sort"
                      onClick={() => setSort(active ? { key: c.key, dir: (sort!.dir * -1) as 1 | -1 } : { key: c.key, dir: c.align === "r" ? -1 : 1 })}
                    >
                      {c.label}
                      <span aria-hidden="true" style={{ opacity: active ? 1 : 0.3 }}>
                        {active && sort!.dir === 1 ? "▲" : "▼"}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const k = rowKey ? rowKey(r, i) : i;
            return (
              <tr
                key={k}
                aria-selected={selected !== undefined ? selected === k : undefined}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "r" ? "r" : undefined}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------- legend

export type LegendKey = "line" | "rect" | "band" | "dot";

export function Legend({ items }: { items: { label: ReactNode; color: string; key?: LegendKey }[] }) {
  return (
    <div className="legend" role="list">
      {items.map((it, i) => (
        <span className="legend-item" role="listitem" key={i}>
          {it.key === "rect" ? (
            <span className="key-rect" style={{ background: it.color }} />
          ) : it.key === "band" ? (
            <span className="key-band" style={{ background: it.color }} />
          ) : it.key === "dot" ? (
            <span className="key-rect" style={{ background: it.color, borderRadius: 999 }} />
          ) : (
            <span className="key-line" style={{ color: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------- stat tile

export type Tone = "good" | "bad" | "flat";

export function StatTile({
  label,
  value,
  unit,
  delta,
  meta,
  spark,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { text: string; tone: Tone };
  meta?: ReactNode;
  spark?: number[];
}) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      <span className="row" style={{ gap: 8 }}>
        {delta ? <span className={`delta delta-${delta.tone}`}>{delta.text}</span> : null}
        {meta ? <span className="tile-meta">{meta}</span> : null}
      </span>
      {spark ? <Sparkline values={spark} /> : null}
    </div>
  );
}

/** 12-ish point sparkline: de-emphasis line, current point in the accent. Drawn at its real width so the dot stays round. */
export function Sparkline({ values, height = 30 }: { values: number[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(180);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 5;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  return (
    <div ref={ref} className="tile-spark" aria-hidden="true">
      <svg width={width} height={height} style={{ display: "block" }}>
        <path d={d} fill="none" style={{ stroke: "var(--muted-series)" }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last)} cy={y(values[last])} r={4} style={{ fill: "var(--accent)", stroke: "var(--surface)" }} strokeWidth={2} />
      </svg>
    </div>
  );
}

// ----------------------------------------------------------------------------- tooltip

export interface TooltipRow {
  color?: string;
  key?: "line" | "rect" | ReactNode;
  value: ReactNode;
  label: ReactNode;
}

/**
 * Positioned inside the chart's relative container; flips left of the pointer near the right edge.
 * Values lead (strong), labels follow (secondary); rows keyed with a short line in series colour.
 */
export function Tooltip({
  x,
  y,
  containerWidth,
  title,
  rows,
  note,
}: {
  x: number;
  y: number;
  containerWidth: number;
  title: ReactNode;
  rows: TooltipRow[];
  note?: ReactNode;
}) {
  const w = 220;
  const left = x + 14 + w > containerWidth ? Math.max(0, x - 14 - w) : x + 14;
  return (
    <div className="tooltip" style={{ left, top: Math.max(0, y - 10), width: w }} role="status" aria-live="polite">
      <div className="tooltip-title">{title}</div>
      {rows.map((r, i) => (
        <div className="tooltip-row" key={i}>
          {r.key === "rect" ? (
            <span className="key-rect" style={{ background: r.color }} />
          ) : r.key && r.key !== "line" ? (
            <span style={{ display: "inline-flex" }}>{r.key}</span>
          ) : r.color ? (
            <span className="key-line" style={{ color: r.color }} />
          ) : (
            <span />
          )}
          <span className="v">{r.value}</span>
          <span className="l">{r.label}</span>
        </div>
      ))}
      {note ? <div className="tooltip-note">{note}</div> : null}
    </div>
  );
}

export function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7v4.5M8 4.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="callout">
      <InfoIcon />
      <div>{children}</div>
    </div>
  );
}
