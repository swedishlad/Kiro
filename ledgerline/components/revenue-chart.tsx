"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
    <div className="rounded-[12px] bg-surface px-3 py-2 text-[13px] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      <p className="flex items-center gap-2 text-ink-2">
        <span className="inline-block size-2 rounded-full bg-s1" aria-hidden />
        This period <span className="ml-auto pl-4 font-medium tabular-nums text-ink">{money(point.revenue)}</span>
      </p>
      <p className="flex items-center gap-2 text-ink-2">
        <span className="inline-block size-2 rounded-full bg-rule" aria-hidden />
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex items-center gap-4 text-[13px] text-ink-2">
          <li className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-s1" aria-hidden /> This period
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-rule" aria-hidden /> Previous period
          </li>
        </ul>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-[13px] text-accent hover:underline">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Daily revenue</caption>
            <thead className="sticky top-0 bg-surface text-left text-ink-2">
              <tr>
                <th className="py-2 font-medium">Day</th>
                <th className="py-2 text-right font-medium">This period</th>
                <th className="py-2 text-right font-medium">Previous</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.label} className="border-t border-line">
                  <td className="py-2">{p.label}</td>
                  <td className="py-2 text-right tabular-nums">{money(p.revenue)}</td>
                  <td className="py-2 text-right tabular-nums text-ink-2">{money(p.prior)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72 w-full" role="img" aria-label="Daily revenue compared with the previous period">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--ink-3)", fontSize: 12 }}
                interval={tickEvery - 1}
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fill: "var(--ink-3)", fontSize: 12 }}
                tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--rule)", strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="prior"
                stroke="var(--rule)"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="var(--series-1)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2, fill: "var(--series-1)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
