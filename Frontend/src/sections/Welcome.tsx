// The Welcome tab: the onboarding page for new visitors. It asks what brought them here and points each answer
// at the right part of the site, shows the three lines on a bill that matter, has the team say hello, answers a
// few common questions and ends with the assistant's prompt box.
// First-time visitors who open the bare address land here (see App.tsx); after that the bare address opens Bill check.

import { useEffect, useRef, useState, type ReactNode } from "react";

import { PromptBox } from "../chat/Chat.tsx";
import { markWelcomed } from "../components/hooks.ts";
import { fmtCents, fmtNum, ymLabel } from "../data/format.ts";
import { consumptionStats, eia, savingsModel, towns } from "../data/load.ts";
import { UTILITIES } from "../data/model.ts";
import { TEAM } from "../data/team.ts";

const monthName = (i: number) => new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2000, i, 1));

// The typical home's busiest and quietest months, for the "seems high" answer.
const TYPICAL = consumptionStats.typicalAccount.monthlyKwh;
const TYPICAL_YEAR = /calendar (\d{4})/.exec(consumptionStats.typicalAccount.population)?.[1];
const PEAK = TYPICAL.indexOf(Math.max(...TYPICAL));
const LOW = TYPICAL.indexOf(Math.min(...TYPICAL));

const [TERM_FROM, TERM_TO] = savingsModel.basicServiceRatesCents.term.split("..");

// Avatars take the categorical slots in order, as on the About page.
const AVATAR_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

type PathId = "high" | "supplier" | "solar" | "curious";

const PATHS: { id: PathId; title: string; sub: string }[] = [
  { id: "high", title: "My bill seems high", sub: "Or it jumped and I'm not sure why" },
  { id: "supplier", title: "Someone offered me a cheaper rate", sub: "By mail, by phone or at the door" },
  { id: "solar", title: "I'm thinking about solar or a heat pump", sub: "Or a home battery" },
  { id: "curious", title: "I'm just curious", sub: "Show me around" },
];

const FAQ: { q: string; a: ReactNode }[] = [
  { q: "Is it really free?", a: "Yes. There's no account to make and nothing to pay for." },
  {
    q: "Can you see my bill?",
    a: "No. Your own browser reads it, on your device, and it's never uploaded. The chat is the one exception: what you type there goes to Google's Gemini to get an answer, so leave account numbers out.",
  },
  {
    q: "My town runs its own electric company, like Braintree or Concord. Will this work?",
    a: "Mostly. You'll get the usage comparison, but town-run utilities don't offer basic service, so there's no standard rate to check yours against.",
  },
  {
    q: "What's basic service, anyway?",
    a: "It's the electricity supply you get if you've never chosen a supplier. Your utility buys it and the state's Department of Public Utilities approves the price. On the fixed option it's one rate for six months at a time; on the monthly option it changes every month.",
  },
];

export default function Welcome() {
  useEffect(markWelcomed, []);
  const [path, setPath] = useState<PathId | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  // On a phone the answer opens below the fold; bring it up.
  useEffect(() => {
    if (!path) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    answerRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [path]);

  return (
    <>
      <header className="welcome-intro">
        <p className="welcome-eyebrow">New here?</p>
        <h1 className="welcome-title">Is your electric bill normal?</h1>
        <p className="welcome-lede">
          Most of us just pay it and move on. Watt-If? puts your bill next to a typical Massachusetts home and your utility's standard rate, so you
          can tell if something's off and what to do about it.
        </p>
        <p className="welcome-skip">
          Got your bill handy? <a href="#/bill">Skip straight to Bill check →</a>
        </p>
      </header>

      <section className="welcome-section welcome-paths" aria-labelledby="welcome-paths">
        <h2 className="welcome-section-title" id="welcome-paths">
          What brings you here?
        </h2>
        <div className="paths" role="group" aria-labelledby="welcome-paths">
          {PATHS.map((p) => (
            <button key={p.id} type="button" className="path" aria-pressed={path === p.id} aria-controls="welcome-answer" onClick={() => setPath(p.id)}>
              <span className="path-text">
                <span className="path-title">{p.title}</span>
                <span className="path-sub">{p.sub}</span>
              </span>
              <span className="path-dot" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div id="welcome-answer" ref={answerRef} aria-live="polite">
          {path ? (
            <div className="card path-answer" key={path}>
              <Answer path={path} />
            </div>
          ) : null}
        </div>
      </section>

      <section className="welcome-section" aria-labelledby="welcome-bill">
        <div className="welcome-section-head">
          <h2 className="welcome-section-title" id="welcome-bill">
            The three lines that matter on your bill
          </h2>
          <p className="welcome-section-lede">
            You don't have to find them yourself. Bill check reads them for you. But if you've ever stared at a bill wondering which numbers count,
            it's these.
          </p>
        </div>
        <div className="bill-explainer">
          <ExampleBill />
          <ol className="bill-notes">
            <li>
              <Mark n={1} />
              <div>
                <h3>Electricity used, in kWh</h3>
                <p>The one number we can't do without. It's usually near the top, often next to a little bar chart of past months.</p>
              </div>
            </li>
            <li>
              <Mark n={2} />
              <div>
                <h3>Your supply rate, in ¢ per kWh</h3>
                <p>
                  Look for “Supply” or “Generation”. It's the only part of the bill you can shop around for, so it's the first thing we check against
                  your utility's basic-service rate.
                </p>
              </div>
            </li>
            <li>
              <Mark n={3} />
              <div>
                <h3>The total</h3>
                <p>Not required, but with it we can compare what you paid, not just what you used.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="welcome-section" aria-labelledby="welcome-us">
        <div className="card welcome-note">
          <div className="note-faces" aria-hidden="true">
            {TEAM.map((name, i) => (
              <span key={name} className="note-face" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                {name[0]}
              </span>
            ))}
          </div>
          <h2 className="welcome-section-title" id="welcome-us">
            Hi, we're {TEAM.slice(0, -1).join(", ")} and {TEAM[TEAM.length - 1]}.
          </h2>
          <p>
            Everything on Watt-If? comes from data the government already publishes: the U.S. Energy Information Administration, the state's
            Department of Public Utilities, ISO New England. It's just spread across spreadsheets and PDFs, so we pulled it together and pointed it
            at the one thing everyone actually has, their electric bill.
          </p>
          <p>
            We don't sell electricity, there are no ads, and nobody pays us when you switch anything. If a number ever looks wrong to you,{" "}
            <a href="#/sources">Data & methods</a> shows exactly where it came from.
          </p>
          <p className="note-sign">{TEAM.join(", ").replace(/, ([^,]*)$/, " & $1")}</p>
        </div>
      </section>

      <section className="welcome-section" aria-labelledby="welcome-faq">
        <h2 className="welcome-section-title welcome-faq-title" id="welcome-faq">
          A few things people ask
        </h2>
        <div className="card faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="welcome-section" aria-labelledby="welcome-ask">
        <div className="welcome-section-head">
          <h2 className="welcome-section-title" id="welcome-ask">
            Still wondering about something?
          </h2>
          <p className="welcome-section-lede">Ask in your own words. It knows everything on this site, and it answers in whatever language you write in.</p>
        </div>
        <PromptBox />
      </section>
    </>
  );
}

function Answer({ path }: { path: PathId }) {
  if (path === "high")
    return (
      <>
        <p className="path-lead">Let's take a look.</p>
        <p>
          Grab your latest bill. A photo, a screenshot or the PDF from your utility's website all work. You'll see how your use compares with a
          typical home that month, whether your rate is higher than it needs to be, and what would bring the bill down.
        </p>
        <p>
          Keep the season in mind, though. A typical Massachusetts home used about {fmtNum(TYPICAL[PEAK])} kWh in {monthName(PEAK)}
          {TYPICAL_YEAR ? ` ${TYPICAL_YEAR}` : ""} and {fmtNum(TYPICAL[LOW])} in {monthName(LOW)}, so a big {monthName(PEAK)} bill isn't always a
          sign of trouble.
        </p>
        <div className="welcome-actions">
          <a className="btn btn-primary btn-large" href="#/bill">
            Check my bill
          </a>
        </div>
      </>
    );
  if (path === "supplier")
    return (
      <>
        <p className="path-lead">Check it against basic service before you sign.</p>
        <p>
          Basic service is the standard rate your utility charges if you never pick a supplier. From {ymLabel(TERM_FROM)} to {ymLabel(TERM_TO)} it's:
        </p>
        <ul className="rate-list">
          {UTILITIES.map((u) => (
            <li key={u.id}>
              <span>{u.name}</span>
              <span className="num">{fmtCents(savingsModel.basicServiceRatesCents[u.id], 2)} per kWh</span>
            </li>
          ))}
        </ul>
        <p>
          If their offer isn't below your utility's rate, you'd be paying more for the same electricity; delivery charges stay the same either
          way. Also ask what the rate becomes after the first term. A lot of them go up quietly.
        </p>
        <p>Already switched a while back? The calculator tells you whether it's actually been saving you money.</p>
        <div className="welcome-actions">
          <a className="btn btn-primary btn-large" href="#/prices">
            Did my supplier save me money?
          </a>
        </div>
      </>
    );
  if (path === "solar")
    return (
      <>
        <p className="path-lead">Start with the Climate section.</p>
        <p>
          It works out the CO₂ behind a home's electricity, how much you'd cut by running things at cleaner hours, and whether solar or a battery
          is worth buying now or better to wait on.
        </p>
        <p>
          Add a bill on Bill check too. It estimates roughly how big a rooftop system would cover your use, and community solar and heat pumps
          come up in its suggestions.
        </p>
        <div className="welcome-actions">
          <a className="btn btn-primary btn-large" href="#/climate">
            Open Climate
          </a>
          <a className="btn btn-large" href="#/bill">
            Check my bill
          </a>
        </div>
      </>
    );
  return (
    <>
      <p className="path-lead">Same here. This is where we'd start.</p>
      <ul className="path-links">
        <li>
          <a href="#/data">Energy data →</a>
          <span>What Massachusetts homes use and pay, month by month since {eia[0].ym.slice(0, 4)}.</span>
        </li>
        <li>
          <a href="#/regime">Regime →</a>
          <span>Whether the state is using more electricity than usual right now, and the next six months.</span>
        </li>
        <li>
          <a href="#/towns">Map →</a>
          <span>All {fmtNum(towns.length)} cities and towns, each with a modeled six-month forecast.</span>
        </li>
      </ul>
    </>
  );
}

function Mark({ n }: { n: number }) {
  return (
    <span className="bill-mark" aria-hidden="true">
      {n}
    </span>
  );
}

/** A made-up bill with the three lines Bill check reads marked; the little usage chart follows the typical home's year. */
function ExampleBill() {
  const max = Math.max(...TYPICAL);
  return (
    <figure className="paper" aria-label="An example electric bill with the three lines that matter marked 1 to 3">
      <div className="paper-head">
        <span className="paper-logo">Your utility</span>
        <span className="paper-meta">
          Account ••••&nbsp;4821
          <br />
          Sep 11 – Oct 11 · 30 days
        </span>
      </div>
      <div className="paper-row is-marked">
        <span>
          <Mark n={1} /> Electricity used
        </span>
        <strong className="num">612 kWh</strong>
      </div>
      <div className="paper-bars" aria-hidden="true">
        {TYPICAL.map((k, i) => (
          <span key={i} className={i === 9 ? "is-now" : undefined} style={{ height: `${(k / max) * 100}%` }} />
        ))}
      </div>
      <p className="paper-group">Delivery services</p>
      <div className="paper-row">
        <span>Customer charge</span>
        <span className="num">$7.00</span>
      </div>
      <div className="paper-row">
        <span>Distribution, transmission & programs</span>
        <span className="num">$89.35</span>
      </div>
      <p className="paper-group">Supply services</p>
      <div className="paper-row is-marked">
        <span>
          <Mark n={2} /> Generation · 612 kWh × 21.70¢
        </span>
        <span className="num">$132.80</span>
      </div>
      <div className="paper-row paper-total is-marked">
        <span>
          <Mark n={3} /> Total amount due
        </span>
        <strong className="num">$229.15</strong>
      </div>
      <figcaption className="paper-foot">An example. Yours will look a bit different, but the same three things are on it.</figcaption>
    </figure>
  );
}
