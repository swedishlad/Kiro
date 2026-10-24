const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-US");

export const money = (n: number) => usd0.format(n);
export const money2 = (n: number) => usd2.format(n);
export const count = (n: number) => int.format(n);
export const percent = (n: number) => `${n.toFixed(2)}%`;

export function pctChange(now: number, prev: number) {
  if (!prev) return 0;
  return ((now - prev) / prev) * 100;
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
