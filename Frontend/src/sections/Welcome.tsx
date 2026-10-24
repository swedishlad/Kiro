// The Welcome tab: the onboarding page for new visitors. What Watt-If? is, what it can answer for them, how to
// check a bill in three steps, a tour of every tab, the assistant's prompt box, our promises and a short FAQ.
// First-time visitors who open the bare address land here (see App.tsx); after that the bare address opens Bill check.

import { useEffect, type ReactNode } from "react";

import { PromptBox } from "../chat/Chat.tsx";
import { markWelcomed } from "../components/hooks.ts";
import { fmtCents, fmtNum, fmtPct, ymLabel } from "../data/format.ts";
import { consumptionStats, savingsModel, towns } from "../data/load.ts";
import { TEAM } from "../data/team.ts";

// The example bill in the hero: a real typical home and a real basic-service rate (the current term's first
// month, National Grid), next to made-up numbers for "you" that the card labels as an example.
const EXAMPLE_YM = savingsModel.basicServiceRatesCents.term.split("..")[0];
const EXAMPLE_TYPICAL_KWH = consumptionStats.typicalAccount.monthlyKwh[Number(EXAMPLE_YM.slice(5, 7)) - 1];
const EXAMPLE_KWH = Math.round((EXAMPLE_TYPICAL_KWH * 0.85) / 10) * 10;
const EXAMPLE_BASIC_CENTS = savingsModel.basicServiceRatesCents.NG;
const EXAMPLE_SUPPLY_CENTS = Math.round((EXAMPLE_BASIC_CENTS + 4.5) * 10) / 10;
const EXAMPLE_SAVING = ((EXAMPLE_SUPPLY_CENTS - EXAMPLE_BASIC_CENTS) * EXAMPLE_KWH) / 100;

const BENEFITS = [
  {
    question: "Is my bill normal?",
    answer: "See your use and cost next to a typical Massachusetts home in the same month, and where you'd rank among homes across the state.",
  },
  {
    question: "Am I paying a fair rate?",
    answer: "Put your supply rate beside your utility's basic-service rate, and find out whether a competitive supplier really saved you money.",
  },
  {
    question: "How can I pay less?",
    answer: "Get ideas picked for your bill, biggest savings first: switching supply, using less, community or rooftop solar, heat pumps.",
  },
  {
    question: "What's going on across the state?",
    answer: "Follow basic-service rates back to 2005, whether homes are using more than usual, a six-month outlook and the CO₂ behind your power.",
  },
];

const STEPS = [
  {
    title: "Grab your bill",
    text: "A photo of a paper bill, or a screenshot of the page with your usage and charges. No bill handy? You can type the numbers in.",
  },
  {
    title: "Add it on Bill check",
    text: "We read it right in your browser in a few seconds. Check what we found and fix anything that looks off.",
  },
  {
    title: "See where you stand",
    text: "Your use, cost and rate next to Massachusetts homes, plus ways to save picked for that bill.",
  },
];

type Icon = "bill" | "chat" | "chart" | "pulse" | "pin" | "people" | "gift" | "lock" | "shield" | "search";

interface Feature {
  icon: Icon;
  color: string;
  name: string;
  kicker?: string;
  text: ReactNode;
  links: { href: string; label: string }[];
  /** instead of links: a button that takes the visitor to the prompt box further down */
  ask?: boolean;
}

const FEATURES: Feature[] = [
  {
    icon: "bill",
    color: "var(--accent)",
    name: "Bill check",
    kicker: "Start here",
    text: "Add a photo of your bill to compare it with homes across Massachusetts and get ways to lower it.",
    links: [{ href: "#/bill", label: "Check my bill" }],
  },
  {
    icon: "chat",
    color: "var(--series-4)",
    name: "Ask Watt If",
    text: "Ask about rates, suppliers, usage or any chart, in plain words and in your own language. Answers come from this site's data.",
    links: [],
    ask: true,
  },
  {
    icon: "chart",
    color: "var(--series-2)",
    name: "Energy data",
    text: (
      <>
        What Massachusetts homes use, what they pay and the CO₂ behind it, with two handy tools: “A home like yours” and “Did your supplier save
        you money?”
      </>
    ),
    links: [
      { href: "#/usage", label: "Usage" },
      { href: "#/prices", label: "Prices & savings" },
      { href: "#/climate", label: "Climate" },
    ],
  },
  {
    icon: "pulse",
    color: "var(--series-3)",
    name: "Regime",
    text: "Is the state using more electricity than usual right now? See the call, how long such stretches tend to last, and a six-month forecast.",
    links: [{ href: "#/regime", label: "See the regimes" }],
  },
  {
    icon: "pin",
    color: "var(--low)",
    name: "Map",
    text: `All ${fmtNum(towns.length)} cities and towns, with their load zone, population and modeled six-month forecast. Search for yours.`,
    links: [{ href: "#/towns", label: "Find your town" }],
  },
  {
    icon: "people",
    color: "var(--mid)",
    name: "About",
    text: `Meet the team (${TEAM.slice(0, -1).join(", ")} and ${TEAM[TEAM.length - 1]}) and see where every number comes from, limits included.`,
    links: [
      { href: "#/about", label: "About us" },
      { href: "#/sources", label: "Data & methods" },
    ],
  },
];

const PROMISES: { icon: Icon; title: string; text: ReactNode }[] = [
  { icon: "gift", title: "Free, no sign-up", text: "No accounts, no paywall, nothing to install. Open a page and start." },
  {
    icon: "lock",
    title: "Your bill stays with you",
    text: "The photo is read in your browser and never uploaded. (Questions for the assistant do go to Google's Gemini, so leave out account numbers.)",
  },
  { icon: "shield", title: "No sales pitch", text: "We don't sell electricity, sign anyone up or get paid for referrals. The choice is always yours." },
  {
    icon: "search",
    title: "Numbers you can check",
    text: (
      <>
        Everything comes from public data: U.S. EIA, Mass.gov DPU, ISO New England, U.S. Census and MassGIS. <a href="#/sources">See how</a>
      </>
    ),
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Who is Watt-If? for?",
    a: "Anyone who pays an electric bill in Massachusetts and wants to understand it, renters and homeowners alike. It's also a good place to start if you're simply curious how the state uses electricity.",
  },
  {
    q: "Which bills does Bill check work with?",
    a: "National Grid, Eversource and Unitil. If a town-run electric company (a municipal light plant, such as Braintree or Concord) serves you, you'll get the usage comparison; those utilities have no basic service to compare your rate with.",
  },
  {
    q: "What happens to my bill photo?",
    a: "A text reader running in your browser reads it, and the photo never leaves your device. The first time, your browser downloads that reader (about 7 MB); after that it's quick.",
  },
  {
    q: "What is “basic service”?",
    a: "The default electricity supply your utility provides if you haven't chosen a competitive supplier, at rates approved by the state's Department of Public Utilities. Comparing your supply rate with it is the quickest way to see whether a supplier is saving you money.",
  },
  {
    q: "Can Watt-If? see my account or switch my supplier?",
    a: "No. We can't see your bill, meter or utility account, and we can't change your service. We show you the numbers; what you do with them is up to you.",
  },
  {
    q: "Where do the numbers come from?",
    a: (
      <>
        Public data from the U.S. EIA, Mass.gov DPU, ISO New England, the U.S. Census and MassGIS, processed by the project's Python backend and
        refreshed daily. <a href="#/sources">Data & methods</a> explains each one, including what it can't tell you.
      </>
    ),
  },
];

/** Scrolls the prompt box into view and puts the cursor in it. */
function goToPrompt() {
  const box = document.getElementById("welcome-ask");
  if (!box) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  box.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  box.querySelector<HTMLInputElement>(".prompt-input")?.focus({ preventScroll: true });
}

export default function Welcome() {
  useEffect(markWelcomed, []);

  return (
    <>
      <header className="welcome-hero">
        <div>
          <p className="welcome-hello">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="9" style={{ fill: "var(--accent)" }} />
              <path d="M18 4 8 18h7l-2 10 11-15h-7z" fill="#fff" />
            </svg>
            Welcome to Watt-If?
          </p>
          <h1 className="welcome-title">Hi there. Let's make sense of your electric bill.</h1>
          <p className="welcome-lede">
            Watt-If? is a free, friendly guide to home electricity in Massachusetts. Show us a bill or ask a question, and we'll tell you how your
            home compares, whether you're paying a fair price, and what could bring the bill down.
          </p>
          <div className="welcome-actions">
            <a className="btn btn-primary" href="#/bill">
              Check my bill
            </a>
            <a className="btn btn-secondary" href="#/data">
              Explore the data
            </a>
          </div>
          <ul className="welcome-trust">
            <li>
              <Check />
              Free, no sign-up
            </li>
            <li>
              <Check />
              Your bill never leaves your device
            </li>
            <li>
              <Check />
              Built on public data
            </li>
          </ul>
        </div>
        <ExampleResult />
      </header>

      <section className="welcome-section" aria-labelledby="welcome-get">
        <SectionHead id="welcome-get" title="What you'll get" lede="Plain answers to the questions people actually have about their electricity." />
        <div className="welcome-benefits">
          {BENEFITS.map((b) => (
            <div className="card benefit" key={b.question}>
              <h3 className="benefit-q">{b.question}</h3>
              <p>{b.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="welcome-section" aria-labelledby="welcome-steps">
        <SectionHead id="welcome-steps" title="Check your bill in three steps" lede="It takes a minute or two, and you can stop at any point." />
        <ol className="welcome-steps">
          {STEPS.map((s, i) => (
            <li className="card step" key={s.title}>
              <span className="step-num" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="step-title">{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="welcome-scope">
          <strong>Made for Massachusetts homes.</strong> Works with National Grid, Eversource and Unitil bills.
        </p>
      </section>

      <section className="welcome-section" aria-labelledby="welcome-tour">
        <SectionHead id="welcome-tour" title="Everything you can do here" lede="Six places to explore. Each one is a tab at the top of the page." />
        <div className="welcome-features">
          {FEATURES.map((f) => (
            <div className="card feature" key={f.name}>
              <div className="feature-head">
                <IconTile icon={f.icon} color={f.color} />
                <h3 className="feature-title">{f.name}</h3>
                {f.kicker ? <span className="feature-kicker">{f.kicker}</span> : null}
              </div>
              <p className="feature-text">{f.text}</p>
              <div className="feature-links">
                {f.ask ? (
                  <button type="button" className="link-button" onClick={goToPrompt}>
                    Ask a question <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  f.links.map((l) => (
                    <a key={l.href} href={l.href}>
                      {l.label} <span aria-hidden="true">→</span>
                    </a>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="welcome-ask" className="welcome-section" aria-labelledby="welcome-ask-title">
        <SectionHead
          id="welcome-ask-title"
          title="Rather just ask?"
          lede="Our assistant knows everything on this site. Ask it anything about Massachusetts electricity, in whatever language you like."
        />
        <PromptBox />
      </section>

      <section className="welcome-section" aria-labelledby="welcome-promises">
        <SectionHead id="welcome-promises" title="Our promises to you" />
        <div className="card welcome-promises">
          {PROMISES.map((p) => (
            <div className="promise" key={p.title}>
              <IconTile icon={p.icon} color="var(--accent)" small />
              <h3 className="promise-title">{p.title}</h3>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="welcome-section" aria-labelledby="welcome-faq">
        <SectionHead id="welcome-faq" title="Questions people ask" />
        <div className="card faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="welcome-section welcome-cta" aria-labelledby="welcome-cta">
        <h2 className="welcome-section-title" id="welcome-cta">
          Ready when you are
        </h2>
        <p className="welcome-section-lede">Grab your latest bill and see how it stacks up. We'll be right here if you have questions.</p>
        <div className="welcome-actions">
          <a className="btn btn-primary" href="#/bill">
            Check my bill
          </a>
          <a className="btn btn-secondary" href="#/data">
            Explore the data
          </a>
        </div>
      </section>
    </>
  );
}

function SectionHead({ id, title, lede }: { id: string; title: string; lede?: string }) {
  return (
    <div className="welcome-section-head">
      <h2 className="welcome-section-title" id={id}>
        {title}
      </h2>
      {lede ? <p className="welcome-section-lede">{lede}</p> : null}
    </div>
  );
}

/** A peek at what Bill check shows, built from real reference numbers and an example bill. */
function ExampleResult() {
  const usageDiff = EXAMPLE_KWH / EXAMPLE_TYPICAL_KWH - 1;
  const max = Math.max(EXAMPLE_KWH, EXAMPLE_TYPICAL_KWH) * 1.05;
  const rateMax = EXAMPLE_SUPPLY_CENTS * 1.05;
  return (
    <figure className="card welcome-preview" aria-label="Example of a Bill check result">
      <div className="welcome-preview-head">
        <span className="welcome-preview-eyebrow">A peek at your results</span>
        <span className="welcome-preview-badge">Example bill</span>
      </div>
      <p className="welcome-preview-title">{ymLabel(EXAMPLE_YM)} · National Grid</p>
      <p className="welcome-preview-verdict">
        You used <strong>less than</strong> a typical Massachusetts home, but your supply rate is <strong>above</strong> basic service.
      </p>
      <div className="compare-row">
        <div className="compare-head">
          <span className="compare-label">Electricity used</span>
          <span className="delta delta-good">{fmtPct(Math.abs(usageDiff))} below</span>
        </div>
        <PreviewBar name="You" value={EXAMPLE_KWH} max={max} label={`${fmtNum(EXAMPLE_KWH)} kWh`} you />
        <PreviewBar name="Typical home" value={EXAMPLE_TYPICAL_KWH} max={max} label={`${fmtNum(EXAMPLE_TYPICAL_KWH)} kWh`} />
      </div>
      <div className="compare-row">
        <div className="compare-head">
          <span className="compare-label">Supply rate per kWh</span>
          <span className="delta delta-bad">{fmtPct(EXAMPLE_SUPPLY_CENTS / EXAMPLE_BASIC_CENTS - 1)} above</span>
        </div>
        <PreviewBar name="You" value={EXAMPLE_SUPPLY_CENTS} max={rateMax} label={fmtCents(EXAMPLE_SUPPLY_CENTS, 2)} you />
        <PreviewBar name="Basic service" value={EXAMPLE_BASIC_CENTS} max={rateMax} label={fmtCents(EXAMPLE_BASIC_CENTS, 2)} />
      </div>
      <div className="welcome-tip">
        <span className="welcome-tip-label">Picked for this bill</span>
        <span className="welcome-tip-title">Switch your supply back to basic service</span>
        <span className="welcome-tip-text">About ${fmtNum(EXAMPLE_SAVING)} a month back in your pocket at this use.</span>
      </div>
      <figcaption className="welcome-preview-foot">
        “You” is a made-up bill; the typical home and the basic-service rate are real figures from this site.
      </figcaption>
    </figure>
  );
}

function PreviewBar({ name, value, max, label, you }: { name: string; value: number; max: number; label: string; you?: boolean }) {
  return (
    <div className="compare-bar">
      <span className="compare-name">{name}</span>
      <span className="compare-track">
        <span className={`compare-fill${you ? " is-you" : ""}`} style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <span className="compare-value num">{label}</span>
    </div>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" style={{ fill: "var(--low)" }} />
      <path d="m4.8 8.2 2.1 2.1 4.3-4.6" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const GLYPHS: Record<Icon, ReactNode> = {
  bill: (
    <>
      <path d="M6 3h8.5L18 6.5V21H6z" />
      <path d="M9 10h6M9 13.5h6M9 17h3.5" />
    </>
  ),
  chat: <path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z" />,
  chart: <path d="M5 20V12M10 20V6M15 20v-9M20 20V4" />,
  pulse: <path d="M3 12h4l2.5-6 5 12 2.5-6H21" />,
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.8a3 3 0 0 1 0 5.4M17.5 14.4a5.5 5.5 0 0 1 3 5.1" />
    </>
  ),
  gift: (
    <>
      <path d="M4 9.5h16v4H4zM5.5 13.5V20h13v-6.5M12 9.5V20" />
      <path d="M12 9.5S10.5 5 8.3 5.4C6.6 5.7 7 8.6 12 9.5zM12 9.5s1.5-4.5 3.7-4.1c1.7.3 1.3 3.2-3.7 4.1z" />
    </>
  ),
  lock: (
    <>
      <path d="M5.5 11h13v9h-13z" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
      <path d="m9 12 2.2 2.2L15.3 10" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m14.6 14.6 5 5" />
    </>
  ),
};

/** An iOS-style app icon: a white line glyph on a rounded colour tile. */
function IconTile({ icon, color, small }: { icon: Icon; color: string; small?: boolean }) {
  return (
    <span className={`icon-tile${small ? " is-small" : ""}`} style={{ background: color }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[icon]}
      </svg>
    </span>
  );
}
