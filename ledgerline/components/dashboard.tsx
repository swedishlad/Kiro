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
import { Segmented } from "@/components/segmented";

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const iconButton =
  "inline-flex h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-[13px] font-medium text-ink transition-opacity hover:opacity-80";

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
      className={clsx(iconButton, "w-8 justify-center px-0")}
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}

function Card({ title, note, children, className }: { title?: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-[18px] bg-surface p-6", className)}>
      {title && (
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          {note && <p className="text-[13px] text-ink-3">{note}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function Stat({ label, value, now, prev }: { label: string; value: string; now: number; prev: number }) {
  return (
    <div className="rounded-[18px] bg-surface p-6">
      <p className="text-[13px] text-ink-2">{label}</p>
      <p className="mt-1 text-[28px] font-semibold tracking-tight tabular-nums">{value}</p>
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
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-ink-2">Storefront sales</p>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">Ledgerline</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Date range" value={range} options={RANGES} onChange={setRange} />
          <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused} className={iconButton}>
            <span
              className={clsx("inline-block size-2 rounded-full", paused || error ? "bg-ink-3" : "live-dot bg-good")}
              aria-hidden
            />
            {paused ? "Paused" : error ? "Offline" : "Live"}
            {paused ? <Play className="size-3" aria-hidden /> : <Pause className="size-3" aria-hidden />}
            <span className="sr-only">{paused ? "Resume updates" : "Pause updates"}</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-[14px] bg-surface px-4 py-3 text-[13px] text-bad">
          Couldn&apos;t refresh the numbers ({error}). Showing the last data we have; retrying every few seconds.
        </p>
      )}

      {!data || !k ? (
        <div className="mt-8 space-y-4" aria-busy="true" aria-label="Loading dashboard">
          <div className="h-40 animate-pulse rounded-[18px] bg-surface motion-reduce:animate-none" />
          <div className="h-80 animate-pulse rounded-[18px] bg-surface motion-reduce:animate-none" />
        </div>
      ) : (
        <main className="mt-8 space-y-4">
          <Card>
            <p id="hero-label" className="text-[15px] text-ink-2">
              Revenue, last {RANGES.find((r) => r.value === data.range)?.label}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p
                className={clsx(
                  "text-5xl font-semibold tracking-tight tabular-nums transition-colors duration-700 sm:text-6xl",
                  flash ? "text-accent" : "text-ink",
                )}
                aria-live="off"
              >
                {money(k.revenue)}
              </p>
              <Delta now={k.revenue} prev={k.revenuePrev} className="text-[15px]" />
            </div>
            <p className="mt-2 text-[13px] text-ink-3">Previous period {money(k.revenuePrev)}</p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Orders" value={count(k.orders)} now={k.orders} prev={k.ordersPrev} />
            <Stat label="Average order" value={money2(k.aov)} now={k.aov} prev={k.aovPrev} />
            <Stat label="Conversion" value={percent(k.conversion)} now={k.conversion} prev={k.conversionPrev} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card title="Daily revenue" note="Includes today so far">
              <RevenueChart series={data.series} />
            </Card>
            <Card title="By channel">
              <ChannelBars channels={data.channels} />
            </Card>
          </div>

          <Card title="Recent orders">
            <OrdersTable orders={data.orders} now={now} />
          </Card>

          <p className="pt-2 text-center text-[12px] text-ink-3">
            Updated {new Date(data.generatedAt).toLocaleTimeString("en-US")} · Sample data from{" "}
            <code className="font-mono">lib/data.ts</code>
          </p>
        </main>
      )}
    </div>
  );
}
