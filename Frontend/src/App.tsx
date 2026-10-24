import { Suspense, lazy, useEffect } from "react";

import { Chat } from "./chat/Chat.tsx";
import { setThemeChoice, useHashRoute, useTheme, type ThemeChoice } from "./components/hooks.ts";
import { Overview } from "./sections/Overview.tsx";

const Usage = lazy(() => import("./sections/Usage.tsx"));
const Prices = lazy(() => import("./sections/Prices.tsx"));
const Grid = lazy(() => import("./sections/Grid.tsx"));
const Towns = lazy(() => import("./sections/Towns.tsx"));
const Sources = lazy(() => import("./sections/Sources.tsx"));
const About = lazy(() => import("./sections/About.tsx"));

const ROUTES = [
  { id: "overview", label: "Overview" },
  { id: "usage", label: "Usage" },
  { id: "prices", label: "Prices & savings" },
  { id: "grid", label: "Regimes & forecast" },
  { id: "towns", label: "Towns" },
  { id: "sources", label: "Data & methods" },
  { id: "about", label: "About" },
] as const;

type RouteId = (typeof ROUTES)[number]["id"];

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
  const raw = useHashRoute("overview");
  const route: RouteId = ROUTES.some((r) => r.id === raw) ? (raw as RouteId) : "overview";
  const { choice } = useTheme();

  useEffect(() => {
    const label = ROUTES.find((r) => r.id === route)!.label;
    document.title = route === "overview" ? "FairWatt MA Energy" : `${label} · FairWatt MA Energy`;
    window.scrollTo({ top: 0 });
  }, [route]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-row">
            <a className="brand" href="#/overview" style={{ color: "inherit", textDecoration: "none" }}>
              <Logo />
              <span className="brand-name">FairWatt</span>
            </a>
            <button type="button" className="theme-toggle" onClick={() => setThemeChoice(NEXT_THEME[choice])} aria-label={`Theme: ${THEME_LABEL[choice]}. Switch to ${THEME_LABEL[NEXT_THEME[choice]]}.`}>
              <ThemeIcon choice={choice} />
              {THEME_LABEL[choice]}
            </button>
          </div>
          <nav className="tabs" aria-label="Dashboard sections">
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
          {route === "overview" && <Overview />}
          {route === "usage" && <Usage />}
          {route === "prices" && <Prices />}
          {route === "grid" && <Grid />}
          {route === "towns" && <Towns />}
          {route === "sources" && <Sources />}
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
