"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Pause, Play, Sun } from "lucide-react";
import clsx from "clsx";
import { useMetrics } from "@/lib/use-metrics";
import { count, money, money2, percent } from "@/lib/format";
import type { Range } from "@/lib/data";
import { Delta } from "@/components/delta";
import { RevenueChart } from "@/components/revenue-chart";
import { ChannelBars } from "@/components/channel-bars";
import { OrdersTable } from "@/components/orders-table";

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid size-9 place-items-center rounded-md border border-line text-ink-2 hover:bg-wash hover:text-ink"
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}

function Panel({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-lg border border-line bg-surface p-5 sm:p-6", className)}>
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {note && <p className="text-sm text-ink-3">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, now, prev }: { label: string; value: string; now: number; prev: number }) {
  return (
    <div className="px-5 py-4 sm:px-6">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <Delta now={now} prev={prev} className="mt-1" />
    </div>
  );
}

export function Dashboard() {
  const [range, setRange] = useState<Range>("30d");
  const { data, error, paused, setPaused, tick } = useMetrics(range);
  const [flash, setFlash] = useState(false);

  // Brief highlight on the headline number whenever fresh data lands.
  useEffect(() => {
    if (!tick) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(id);
  }, [tick]);

  const k = data?.kpis;
  const now = data ? new Date(data.generatedAt).getTime() : Date.now();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-ink font-display text-lg font-bold text-page" aria-hidden>
            L
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">Ledgerline</h1>
            <p className="text-sm text-ink-3">Storefront sales</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Date range" className="flex rounded-md border border-line p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={range === r.value}
                onClick={() => setRange(r.value)}
                className={clsx(
                  "rounded px-3 py-1.5 text-sm",
                  range === r.value ? "bg-ink text-page" : "text-ink-2 hover:bg-wash hover:text-ink",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPaused(!paused)}
            aria-pressed={paused}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-2 hover:bg-wash hover:text-ink"
          >
            <span className={clsx("relative inline-block size-2 rounded-full bg-current", !paused && !error && "live-dot text-good")} aria-hidden />
            {paused ? "Paused" : error ? "Offline" : "Live"}
            {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            <span className="sr-only">{paused ? "Resume updates" : "Pause updates"}</span>
          </button>

          <ThemeToggle />
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-line bg-surface px-4 py-3 text-sm text-bad">
          Couldn&apos;t refresh the numbers ({error}). Showing the last data we have; retrying every few seconds.
        </p>
      )}

      {!data || !k ? (
        <div className="mt-10 space-y-6" aria-busy="true" aria-label="Loading dashboard">
          <div className="h-24 w-72 animate-pulse rounded-md bg-wash motion-reduce:animate-none" />
          <div className="h-80 animate-pulse rounded-lg bg-wash motion-reduce:animate-none" />
        </div>
      ) : (
        <main>
          <section className="pb-8 pt-10" aria-labelledby="hero-label">
            <p id="hero-label" className="text-sm text-ink-2">
              Revenue, last {RANGES.find((r) => r.value === range)?.label}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p
                className={clsx(
                  "font-display text-5xl font-bold tracking-tight tabular-nums transition-colors duration-700 sm:text-7xl",
                  flash ? "text-accent" : "text-ink",
                )}
                aria-live="off"
              >
                {money(k.revenue)}
              </p>
              <Delta now={k.revenue} prev={k.revenuePrev} className="text-base" />
            </div>
            <p className="mt-2 text-sm text-ink-3">Previous period: {money(k.revenuePrev)}</p>
          </section>

          <div className="grid divide-y divide-line rounded-lg border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Stat label="Orders" value={count(k.orders)} now={k.orders} prev={k.ordersPrev} />
            <Stat label="Average order" value={money2(k.aov)} now={k.aov} prev={k.aovPrev} />
            <Stat label="Conversion" value={percent(k.conversion)} now={k.conversion} prev={k.conversionPrev} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel title="Daily revenue" note="Includes today so far">
              <RevenueChart series={data.series} />
            </Panel>
            <Panel title="Revenue by channel">
              <ChannelBars channels={data.channels} />
            </Panel>
          </div>

          <Panel title="Recent orders" note="New orders appear as they come in" className="mt-6">
            <OrdersTable orders={data.orders} now={now} />
          </Panel>

          <p className="mt-6 text-sm text-ink-3">
            Updated {new Date(data.generatedAt).toLocaleTimeString("en-US")}. Figures are sample data; connect your own source in{" "}
            <code className="rounded bg-wash px-1 py-0.5 text-ink-2">lib/data.ts</code>.
          </p>
        </main>
      )}
    </div>
  );
}
