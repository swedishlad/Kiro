// The first-visit intro: one page over Bill check that says what Watt-If? does, shows the three lines on a
// bill it reads and who made it. Its button (or ×, Escape, a click outside) closes it onto Bill check.
// App.tsx decides when it shows; dropping or pasting a bill closes it too, so Bill check's report isn't hidden.

import { useEffect, useRef } from "react";

import { TEAM } from "../data/team.ts";

// Avatars take the categorical slots in order, as on the About page.
const AVATAR_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export function Intro({ onClose }: { onClose: () => void }) {
  const goRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    goRef.current?.focus({ preventScroll: true }); // on a short window the card starts at its heading, not its button
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    window.addEventListener("drop", onClose);
    window.addEventListener("paste", onClose);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener("keydown", key);
      window.removeEventListener("drop", onClose);
      window.removeEventListener("paste", onClose);
    };
  }, [onClose]);

  return (
    <div className="intro-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title" aria-describedby="intro-lede">
        <button type="button" className="intro-close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <p className="intro-eyebrow">New here?</p>
        <h1 className="intro-title" id="intro-title">
          Is your electric bill normal?
        </h1>
        <p className="intro-lede" id="intro-lede">
          Most of us just pay it and move on. Watt-If? puts your bill next to a typical Massachusetts home and your utility's standard rate, so you
          can tell if something's off and what to do about it.
        </p>

        <p className="intro-label">All it takes is your latest bill. We read three lines on it:</p>
        <div className="intro-bill" role="img" aria-label="An example bill: 612 kWh used, a supply rate of 21.70 cents per kWh, $229.15 total">
          <div className="intro-bill-row">
            <span>
              <Mark n={1} /> Electricity used
            </span>
            <strong className="num">612 kWh</strong>
          </div>
          <div className="intro-bill-row">
            <span>
              <Mark n={2} /> Supply (generation) rate
            </span>
            <strong className="num">21.70¢/kWh</strong>
          </div>
          <div className="intro-bill-row">
            <span>
              <Mark n={3} /> Total amount due
            </span>
            <strong className="num">$229.15</strong>
          </div>
        </div>
        <p className="intro-small">
          A photo, a screenshot or the PDF all work, and Bill check finds the lines for you. Your bill is read on your device and never uploaded.
        </p>

        <div className="intro-team">
          <span className="intro-faces" aria-hidden="true">
            {TEAM.map((name, i) => (
              <span key={name} style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                {name[0]}
              </span>
            ))}
          </span>
          <p>
            Made by {TEAM.slice(0, -1).join(", ")} and {TEAM[TEAM.length - 1]} from public data. Free, no account, no ads, and nobody pays us when
            you switch anything.
          </p>
        </div>

        <div className="intro-actions">
          <button ref={goRef} type="button" className="btn btn-primary intro-go" onClick={onClose}>
            Check my bill
          </button>
        </div>
      </section>
    </div>
  );
}

function Mark({ n }: { n: number }) {
  return (
    <span className="intro-mark" aria-hidden="true">
      {n}
    </span>
  );
}
