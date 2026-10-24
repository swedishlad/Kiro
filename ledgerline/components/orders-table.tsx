"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import clsx from "clsx";
import { money2, timeAgo } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/data";
import { Segmented } from "@/components/segmented";

type SortKey = "placedAt" | "customer" | "amount";
type StatusFilter = "all" | OrderStatus;
const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
];

const statusDot: Record<OrderStatus, string> = {
  paid: "bg-good",
  pending: "bg-ink-3",
  refunded: "bg-bad",
};

export function OrdersTable({ orders, now }: { orders: Order[]; now: number }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
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
    const Icon = sort.dir === "asc" ? ChevronUp : ChevronDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={clsx("py-2 font-medium", align === "right" && "text-right")}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={clsx("inline-flex items-center gap-0.5 hover:text-ink", active ? "text-ink" : "text-ink-2")}
        >
          {label}
          <Icon className={clsx("size-3.5", !active && "invisible")} aria-hidden />
        </button>
      </th>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1 sm:max-w-xs">
          <span className="sr-only">Search orders</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-[10px] bg-fill py-1.5 pl-8 pr-3 text-[15px] placeholder:text-ink-3 focus:outline-none focus-visible:outline-[3px]"
          />
        </label>
        <Segmented label="Filter by status" value={status} options={STATUSES} onChange={setStatus} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-[15px]">
          <caption className="sr-only">Recent orders</caption>
          <thead>
            <tr className="text-left text-[13px] text-ink-2">
              <th scope="col" className="py-2 font-medium">Order</th>
              <SortHead label="Customer" k="customer" />
              <th scope="col" className="py-2 font-medium">Channel</th>
              <th scope="col" className="py-2 font-medium">Status</th>
              <SortHead label="Amount" k="amount" align="right" />
              <SortHead label="Placed" k="placedAt" align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((o) => (
              <tr key={o.id + o.placedAt} className="border-t border-line">
                <td className="py-3 pr-3 tabular-nums text-ink-2">{o.id}</td>
                <td className="py-3 pr-3 text-ink">{o.customer}</td>
                <td className="py-3 pr-3 text-ink-2">{o.channel}</td>
                <td className="py-3 pr-3">
                  <span className="inline-flex items-center gap-1.5 capitalize text-ink">
                    <span className={clsx("inline-block size-1.5 rounded-full", statusDot[o.status])} aria-hidden />
                    {o.status}
                  </span>
                </td>
                <td className="py-3 text-right tabular-nums">{money2(o.amount)}</td>
                <td className="py-3 pl-3 text-right tabular-nums text-ink-2">{timeAgo(o.placedAt, now)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="border-t border-line py-10 text-center text-ink-2">
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
