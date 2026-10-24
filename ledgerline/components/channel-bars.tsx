import { money } from "@/lib/format";

// Channels are compared by magnitude, so every bar shares one hue.
export function ChannelBars({ channels }: { channels: { name: string; revenue: number }[] }) {
  const max = Math.max(...channels.map((c) => c.revenue), 1);
  const total = channels.reduce((a, c) => a + c.revenue, 0) || 1;

  return (
    <ul className="space-y-4">
      {channels.map((c) => (
        <li key={c.name}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink">{c.name}</span>
            <span className="tabular-nums text-ink-2">
              {money(c.revenue)} <span className="text-ink-3">({Math.round((c.revenue / total) * 100)}%)</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-wash" aria-hidden>
            <div
              className="h-2 rounded-full bg-s1 transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${(c.revenue / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
