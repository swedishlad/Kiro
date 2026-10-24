import { Suspense, lazy, useEffect } from "react";

import { Chat } from "./chat/Chat.tsx";
import { setThemeChoice, useHashRoute, useTheme, type ThemeChoice } from "./components/hooks.ts";

const Bill = lazy(() => import("./sections/Bill.tsx"));
const EnergyData = lazy(() => import("./sections/EnergyData.tsx"));
const Regime = lazy(() => import("./sections/Regime.tsx"));
const Towns = lazy(() => import("./sections/Towns.tsx"));
const About = lazy(() => import("./sections/About.tsx"));

const ROUTES = [
  { id: "bill", label: "Bill check" },
  { id: "data", label: "Energy data" },
  { id: "regime", label: "Regime" },
  { id: "towns", label: "Map" },
  { id: "about", label: "About" },
] as const;

type RouteId = (typeof ROUTES)[number]["id"];

/**
 * Section addresses. Usage, Prices & savings and Data & methods used to be tabs and are now sections of a
 * combined tab; their old links (which the assistant also writes) open that tab and scroll to the section, as
 * #/climate does for the Climate section. Regimes & forecast is the Regime tab's section.
 * The old Overview and Welcome addresses open the landing page; the old use-levels address opens the Regime tab.
 */
const SECTIONS: Record<string, { tab: RouteId; label: string; scroll: boolean } | undefined> = {
  usage: { tab: "data", label: "Usage", scroll: true },
  prices: { tab: "data", label: "Prices & savings", scroll: true },
  grid: { tab: "regime", label: "Regimes & forecast", scroll: true },
  hourly: { tab: "data", label: "Hour by hour", scroll: true },
  levels: { tab: "regime", label: "Regime", scroll: false },
  climate: { tab: "data", label: "Climate", scroll: true },
  sources: { tab: "about", label: "Data & methods", scroll: true },
  overview: { tab: "bill", label: "Bill check", scroll: false },
  welcome: { tab: "bill", label: "Bill check", scroll: false },
};

/**
 * Waits for a lazily loaded section to render, then scrolls it under the sticky bar. Sections above it
 * load their own data and grow, so it keeps the section in place for a few seconds, until the visitor
 * scrolls or types.
 */
function scrollToSection(id: string): () => void {
  let frame = 0;
  let pinnedTop: number | null = null;
  const started = performance.now();
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const e of ["wheel", "touchstart", "keydown"]) window.removeEventListener(e, stop);
  };
  const tick = () => {
    const el = document.getElementById(`sec-${id}`);
    if (el && (pinnedTop === null || Math.abs(el.getBoundingClientRect().top - pinnedTop) > 1)) {
      el.scrollIntoView({ block: "start" });
      pinnedTop = el.getBoundingClientRect().top;
    }
    if (performance.now() - started < (el ? 8000 : 4000)) frame = requestAnimationFrame(tick);
    else stop();
  };
  for (const e of ["wheel", "touchstart", "keydown"]) window.addEventListener(e, stop, { passive: true });
  frame = requestAnimationFrame(tick);
  return stop;
}

const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const THEME_LABEL: Record<ThemeChoice, string> = { system: "Auto", light: "Light", dark: "Dark" };

function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" style={{ fill: "var(--accent)" }} />
      <path d="M18 4 8 18h7l-2 10 11-15h-7z" fill="#fff" />
    </svg>
  );
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  if (choice === "light")
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="3.2" fill="currentColor" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  if (choice === "dark")
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13.5 10.2A5.8 5.8 0 0 1 5.8 2.5a5.8 5.8 0 1 0 7.7 7.7z" fill="currentColor" />
      </svg>
    );
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
    </svg>
  );
}

export function App() {
  const raw = useHashRoute("bill");
  const section = SECTIONS[raw];
  const route: RouteId = ROUTES.some((r) => r.id === raw) ? (raw as RouteId) : (section?.tab ?? "bill");
  const { choice } = useTheme();

  useEffect(() => {
    const label = section?.scroll ? section.label : ROUTES.find((r) => r.id === route)!.label;
    document.title = route === "bill" ? "Watt-If? · Check your Massachusetts electric bill" : `${label} · Watt-If?`;
    if (section?.scroll) return scrollToSection(raw);
    window.scrollTo({ top: 0 });
  }, [raw, route, section]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-row">
            <a className="brand" href="#/bill" style={{ color: "inherit", textDecoration: "none" }}>
              <Logo />
              <span className="brand-name">Watt-If?</span>
            </a>
            <button type="button" className="theme-toggle" onClick={() => setThemeChoice(NEXT_THEME[choice])} aria-label={`Theme: ${THEME_LABEL[choice]}. Switch to ${THEME_LABEL[NEXT_THEME[choice]]}.`}>
              <ThemeIcon choice={choice} />
              {THEME_LABEL[choice]}
            </button>
          </div>
          <nav className="tabs" aria-label="Site sections">
            {ROUTES.map((r) => (
              <a key={r.id} className="tab" href={`#/${r.id}`} aria-current={r.id === route ? "page" : undefined}>
                {r.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<div className="loading">Loading…</div>}>
          {route === "bill" && <Bill />}
          {route === "data" && <EnergyData />}
          {route === "regime" && <Regime />}
          {route === "towns" && <Towns />}
          {route === "about" && <About />}
        </Suspense>
      </main>
      <footer className="footer">
        <span>Public data: U.S. EIA (Form 861M, RECS 2020), Mass.gov DPU basic service rates, ISO New England, U.S. Census, MassGIS / LMEC town boundaries.</span>
        <span>
          Supply-side dollar figures only · <a href="#/sources">How these numbers are made</a>
        </span>
      </footer>
      <Chat page={route} />
    </>
  );
}
