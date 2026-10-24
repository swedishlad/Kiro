"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { money } from "@/lib/format";
import type { Metrics } from "@/lib/data";

type Point = Metrics["series"][number];

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-medium text-ink">{label}</p>
      <p className="flex items-center gap-2 text-ink-2">
        <span className="inline-block h-0.5 w-3 bg-s1" aria-hidden />
        This period <span className="ml-auto pl-4 font-medium tabular-nums text-ink">{money(point.revenue)}</span>
      </p>
      <p className="flex items-center gap-2 text-ink-2">
        <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-ink-3" aria-hidden />
        Previous <span className="ml-auto pl-4 font-medium tabular-nums text-ink">{money(point.prior)}</span>
      </p>
    </div>
  );
}

export function RevenueChart({ series }: { series: Point[] }) {
  const [asTable, setAsTable] = useState(false);
  const tickEvery = Math.max(1, Math.floor(series.length / 6));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex items-center gap-5 text-sm text-ink-2">
          <li className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 bg-s1" aria-hidden /> This period
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block w-4 border-t-2 border-dashed border-ink-3" aria-hidden /> Previous period
          </li>
        </ul>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="rounded-md px-2 py-1 text-sm text-ink-2 underline-offset-4 hover:bg-wash hover:text-ink hover:underline"
        >
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-80 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily revenue</caption>
            <thead className="sticky top-0 bg-surface text-left text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">This period</th>
                <th className="px-3 py-2 text-right font-medium">Previous</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.label} className="border-t border-line">
                  <td className="px-3 py-1.5">{p.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(p.revenue)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink-2">{money(p.prior)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-80 w-full" role="img" aria-label="Daily revenue compared with the previous period">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--rule)" }}
                tick={{ fill: "var(--ink-3)", fontSize: 12 }}
                interval={tickEvery - 1}
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fill: "var(--ink-3)", fontSize: 12 }}
                tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--rule)", strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="prior"
                stroke="var(--ink-3)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--series-1)"
                strokeWidth={2}
                fill="url(#rev-fill)"
                dot={false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
