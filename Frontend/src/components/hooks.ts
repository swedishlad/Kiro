import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Width of an element, tracked with ResizeObserver (charts redraw to fit, never scale text). */
export function useWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export type ThemeChoice = "system" | "light" | "dark";

const THEME_KEY = "fw-theme";
const themeListeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage unavailable: the choice still applies for this visit */
  }
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
  current = choice;
  themeListeners.forEach((l) => l());
}

let current: ThemeChoice = typeof window === "undefined" ? "system" : readChoice();

function subscribe(cb: () => void) {
  themeListeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    themeListeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

/** The viewer's choice plus the theme actually in effect (for JS-computed colour ramps). */
export function useTheme(): { choice: ThemeChoice; dark: boolean } {
  const choice = useSyncExternalStore(subscribe, () => current, () => "system" as ThemeChoice);
  const systemDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return { choice, dark: choice === "dark" || (choice === "system" && systemDark) };
}

// Set once the first-visit intro has been closed (or, before the intro, the old Welcome page was seen).
const INTRO_KEY = "fw-welcomed";

/** Whether this browser has closed the first-visit intro. Without storage, assume so rather than show it on every visit. */
export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) !== null;
  } catch {
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {
    /* storage unavailable: hasSeenIntro already answers yes */
  }
}

/** Tiny hash router: "#/prices" -> "prices". */
export function useHashRoute(defaultRoute: string): string {
  const get = () => window.location.hash.replace(/^#\/?/, "").split("?")[0] || defaultRoute;
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => setRoute(get());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

/** A piece of UI state remembered per viewer (tab-level filters). Falls back to memory only. */
export function usePersistentState<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(`fw-${key}`) as T | null;
      return v && allowed.includes(v) ? v : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(`fw-${key}`, v);
    } catch {
      /* ignore */
    }
  };
  return [value, set];
}
