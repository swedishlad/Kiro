"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import clsx from "clsx";
import { money2, timeAgo } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/data";

type SortKey = "placedAt" | "customer" | "amount";
const STATUSES: ("all" | OrderStatus)[] = ["all", "paid", "pending", "refunded"];

const statusStyle: Record<OrderStatus, string> = {
  paid: "text-good",
  pending: "text-ink-2",
  refunded: "text-bad",
};

export function OrdersTable({ orders, now }: { orders: Order[]; now: number }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OrderStatus>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "placedAt", dir: "desc" });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = orders.filter(
      (o) =>
        (status === "all" || o.status === status) &&
        (!q || o.customer.toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || o.channel.toLowerCase().includes(q)),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "amount") return (a.amount - b.amount) * dir;
      if (sort.key === "customer") return a.customer.localeCompare(b.customer) * dir;
      return (new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()) * dir;
    });
  }, [orders, query, status, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "customer" ? "asc" : "desc" }));
  }

  function SortHead({ label, k, align = "left" }: { label: string; k: SortKey; align?: "left" | "right" }) {
    const active = sort.key === k;
    const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={clsx("px-3 py-2 font-medium", align === "right" && "text-right")}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={clsx(
            "inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-wash hover:text-ink",
            active ? "text-ink" : "text-ink-2",
          )}
        >
          {label}
          <Icon className="size-3.5" aria-hidden />
        </button>
      </th>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1 sm:max-w-xs">
          <span className="sr-only">Search orders</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, order, or channel"
            className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-ink-3"
          />
        </label>
        <div role="group" aria-label="Filter by status" className="flex rounded-md border border-line p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={clsx(
                "rounded px-3 py-1.5 text-sm capitalize",
                status === s ? "bg-ink text-page" : "text-ink-2 hover:bg-wash hover:text-ink",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Recent orders</caption>
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className="px-3 py-2 font-medium text-ink-2">Order</th>
              <SortHead label="Customer" k="customer" />
              <th scope="col" className="px-3 py-2 font-medium text-ink-2">Channel</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-2">Status</th>
              <SortHead label="Amount" k="amount" align="right" />
              <SortHead label="Placed" k="placedAt" align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((o) => (
              <tr key={o.id + o.placedAt} className="border-b border-line hover:bg-wash">
                <td className="px-3 py-2.5 tabular-nums text-ink-2">{o.id}</td>
                <td className="px-3 py-2.5 text-ink">{o.customer}</td>
                <td className="px-3 py-2.5 text-ink-2">{o.channel}</td>
                <td className={clsx("px-3 py-2.5 capitalize", statusStyle[o.status])}>{o.status}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money2(o.amount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{timeAgo(o.placedAt, now)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-ink-2">
                  No orders match. Clear the search or choose a different status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
