"use client";

import clsx from "clsx";

// iOS-style segmented control: a grey track with the chosen segment raised.
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={clsx("inline-flex rounded-[9px] bg-fill p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-[7px] px-3.5 py-1 text-[13px] font-medium transition-colors duration-200",
            value === o.value ? "bg-knob text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
