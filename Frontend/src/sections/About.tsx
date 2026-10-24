import { Card } from "../components/ui.tsx";
import { TEAM } from "../data/team.ts";
import Sources from "./Sources.tsx";

// Avatars take the categorical slots in order, so each person keeps the same colour in both themes.
const AVATAR_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export default function About() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">About FairWatt</h1>
          <p className="page-lede">
            FairWatt is a free, public dashboard about Massachusetts residential electricity: what homes use, what they pay, what basic
            service costs, and whether use is running above or below its usual range.
          </p>
        </div>
      </div>
      <div className="grid">
        <Card className="span-12" title="Our team">
          <ul className="team">
            {TEAM.map((name, i) => (
              <li className="member" key={name}>
                <span className="member-avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }} aria-hidden="true">
                  {name[0]}
                </span>
                <span className="member-name">{name}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="span-6" title="What it is">
          <div className="prose">
            <p>
              Every number comes from public data — U.S. EIA, Mass.gov DPU, ISO New England, U.S. Census and MassGIS — processed by the
              project's Python backend and refreshed daily.
            </p>
            <p>
              The site has no user accounts and cannot see anyone's bill, meter or utility account. It does not sell electricity or sign
              anyone up.
            </p>
          </div>
        </Card>

        <Card className="span-6" title="How it works">
          <div className="prose">
            <p>
              The dashboard reads the backend's files directly, so it always shows exactly what the backend produced. The “Ask FairWatt”
              assistant answers from a knowledge base built from the same files.
            </p>
            <p>
              Sources, methods and limits are in <a href="#/sources">Data and methods</a> below.
            </p>
          </div>
        </Card>
      </div>
      <section id="sec-sources" className="page-section page-section-break" aria-label="Data and methods">
        <Sources />
      </section>
    </>
  );
}
