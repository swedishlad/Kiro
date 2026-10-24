import { MONTHS, ymIndex } from "../data/format.ts";

/** Rough rendered width of an 11–12px system-sans label; good enough to reserve margins. */
export function textWidth(s: string, px = 11): number {
  return s.length * px * 0.58 + 2;
}

export interface Tick {
  i: number;
  label: string;
}

/**
 * Ticks for a monthly YYYY-MM axis: Januaries every k years on long spans, quarter or half-year
 * starts on short ones — never more than fit at ~64px apart.
 */
export function monthTicks(yms: string[], innerWidth: number): Tick[] {
  const n = yms.length;
  if (n === 0) return [];
  const maxTicks = Math.max(2, Math.floor(innerWidth / 64));
  if (n <= 30) {
    const step = [1, 2, 3, 6, 12].find((s) => Math.ceil(n / s) <= maxTicks) ?? 12;
    return yms.flatMap((m, i) => {
      const idx = ymIndex(m);
      if ((idx % 12) % step !== 0) return [];
      return [{ i, label: `${MONTHS[idx % 12]} ’${String(Math.floor(idx / 12)).slice(2)}` }];
    });
  }
  const years = n / 12;
  const step = [1, 2, 3, 5, 10].find((s) => years / s <= maxTicks) ?? 10;
  return yms.flatMap((m, i) => {
    const idx = ymIndex(m);
    const year = Math.floor(idx / 12);
    if (idx % 12 !== 0 || year % step !== 0) return [];
    return [{ i, label: String(year) }];
  });
}

/** Evenly thinned category ticks (e.g. Jan…Dec, or year labels on a column chart). */
export function categoryTicks(labels: string[], innerWidth: number, minGap = 40): Tick[] {
  const maxTicks = Math.max(2, Math.floor(innerWidth / minGap));
  const step = Math.max(1, Math.ceil(labels.length / maxTicks));
  return labels.flatMap((label, i) => (i % step === 0 ? [{ i, label }] : []));
}

/** Ticks for a daily YYYY-MM-DD axis: year starts on long spans, month starts on short ones. */
export function dayTicks(dates: string[], innerWidth: number): Tick[] {
  const maxTicks = Math.max(2, Math.floor(innerWidth / 64));
  const starts = dates.flatMap((d, i) => (d.endsWith("-01") ? [{ i, ym: d.slice(0, 7) }] : []));
  const months = starts.length;
  if (months > maxTicks * 3) {
    const years = starts.filter((s) => s.ym.endsWith("-01"));
    const step = [1, 2, 5].find((k) => years.length / k <= maxTicks) ?? 5;
    return years.filter((_, k) => k % step === 0).map((s) => ({ i: s.i, label: s.ym.slice(0, 4) }));
  }
  const step = [1, 2, 3, 6].find((k) => months / k <= maxTicks) ?? 6;
  return starts
    .filter((s) => (ymIndex(s.ym) % 12) % step === 0)
    .map((s) => ({ i: s.i, label: `${MONTHS[ymIndex(s.ym) % 12]} ’${s.ym.slice(2, 4)}` }));
}
