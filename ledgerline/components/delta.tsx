import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import { pctChange } from "@/lib/format";

// Direction is carried by icon + sign + text, never by color alone.
export function Delta({ now, prev, className }: { now: number; prev: number; className?: string }) {
  const change = pctChange(now, prev);
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums",
        up ? "text-good" : "text-bad",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span>
        {up ? "+" : "-"}
        {Math.abs(change).toFixed(1)}%
      </span>
      <span className="sr-only">{up ? "up" : "down"} versus the previous period</span>
    </span>
  );
}
