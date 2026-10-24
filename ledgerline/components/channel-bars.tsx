import { money } from "@/lib/format";

// Channels are compared by magnitude, so every bar shares one hue.
export function ChannelBars({ channels }: { channels: { name: string; revenue: number }[] }) {
  const max = Math.max(...channels.map((c) => c.revenue), 1);
  const total = channels.reduce((a, c) => a + c.revenue, 0) || 1;

  return (
    <ul className="space-y-5">
      {channels.map((c) => (
        <li key={c.name}>
          <div className="mb-2 flex items-baseline justify-between gap-3 text-[15px]">
            <span className="text-ink">{c.name}</span>
            <span className="tabular-nums text-ink">
              {money(c.revenue)} <span className="text-[13px] text-ink-3">{Math.round((c.revenue / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-fill" aria-hidden>
            <div
              className="h-1.5 rounded-full bg-s1 transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${(c.revenue / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
