"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Metrics, Range } from "@/lib/data";

export function useMetrics(range: Range, intervalMs = 5000) {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0); // increments on each successful refresh
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    try {
      const res = await fetch(`/api/metrics?range=${range}`, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as Metrics);
      setError(null);
      setTick((t) => t + 1);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    }
  }, [range]);

  useEffect(() => {
    load();
    if (paused) return;
    const id = setInterval(load, intervalMs);
    return () => {
      clearInterval(id);
      controller.current?.abort();
    };
  }, [load, paused, intervalMs]);

  return { data, error, paused, setPaused, refresh: load, tick };
}
